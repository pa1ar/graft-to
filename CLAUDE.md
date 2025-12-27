# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Graft is a graph visualization tool for Craft documents. It creates interactive 2D and 3D force-directed graphs showing how documents relate through links. The app runs entirely in the browser with a privacy-first proxy architecture.

## Common Commands

```bash
# Development
bun install        # Install dependencies
bun dev           # Start development server (http://localhost:3000)

# Production
bun build         # Build for production
bun start         # Start production server

# Linting
bun lint          # Run ESLint
```

## Architecture

### Tech Stack
- **Runtime**: Next.js 16 (App Router) on Bun
- **Graph Rendering**: react-force-graph-2d & react-force-graph-3d
- **UI Framework**: shadcn/ui components with Tailwind CSS 4
- **Storage**: IndexedDB for client-side caching
- **Analytics**: Vercel Analytics

### Privacy-First Proxy Architecture

The app uses a CORS proxy pattern to enable browser-to-Craft API communication:

1. **Client stores credentials**: API URL and key stored in `localStorage` (never sent to server for storage)
2. **Proxy forwards requests**: `/api/craft/[...path]` route forwards requests to Craft API with credentials from request headers
3. **No server-side persistence**: Credentials exist only in request headers, never logged or stored on server

See `app/api/craft/[...path]/route.ts:1` for the proxy implementation.

### Core Graph Library (`lib/graph/`)

The graph processing logic is **framework-agnostic** and reusable. It can be extracted and used independently:

```typescript
import { createFetcher } from '@/lib/graph'

const fetcher = createFetcher(apiUrl, apiKey)
const graph = await fetcher.buildGraph({
  onProgress: (current, total, message) => {
    console.log(`${current}/${total}: ${message}`)
  }
})
```

**Key modules:**

- `types.ts:1` - TypeScript type definitions for graph data, Craft API responses, and caching
- `parser.ts:1` - Link extraction from markdown using regex (`/\[([^\]]+)\]\(block:\/\/([^)]+)\)/g`) and graph building
- `fetcher.ts:1` - Craft API client with optimized parallel fetching and incremental updates
- `cache.ts:1` - IndexedDB caching layer with 24-hour TTL
- `index.ts:1` - Public API exports

**Link extraction:** Documents contain markdown with block links in format `[text](block://BLOCK_ID)`. The parser recursively extracts these from nested block structures and maps block IDs to their parent document IDs to build the document-level graph.

### Incremental Updates with Chronological Tracking

The app performs efficient incremental updates by:

1. Storing document metadata with `lastModifiedAt` timestamps in IndexedDB (see `cache.ts:11`)
2. Comparing cached timestamps against current document state on refresh
3. Only fetching blocks for added/modified/deleted documents (see `fetcher.ts:962`)
4. Using the `/documents/search` endpoint with regex to discover links without fetching all blocks

This significantly reduces API calls by only updating changed documents rather than rebuilding the entire graph.

### Data Flow

1. **Initial Load**:
   - Check IndexedDB cache for recent graph data
   - If cached and valid (< 24h old), display immediately
   - Otherwise, fetch all documents from Craft API via proxy
   - Fetch blocks in parallel (concurrency: 15) to extract links
   - Build graph from document relationships
   - Cache graph data and document metadata in IndexedDB

2. **Incremental Refresh**:
   - Fetch current document list with metadata
   - Compare `lastModifiedAt` timestamps against cached metadata
   - Only re-fetch blocks for changed documents
   - Update graph incrementally, preserving unchanged parts
   - Update cache with new graph state

3. **Graph Rendering**:
   - Nodes represent documents (colored by connection count)
   - Links represent document-to-document relationships
   - Force-directed layout with configurable physics
   - Real-time updates during data fetching via streaming callbacks

### Component Structure

```
app/
├── page.tsx              # Main graph visualization page
├── layout.tsx            # Root layout with analytics
└── api/craft/[...path]/  # Craft API proxy (GET requests only)

components/
├── graph/
│   ├── force-graph.tsx      # 2D graph with react-force-graph-2d
│   ├── force-graph-3d.tsx   # 3D graph with react-force-graph-3d
│   ├── graph-controls.tsx   # Connection settings, refresh, stats panel
│   └── node-preview.tsx     # Node detail view with relationships
└── ui/                      # shadcn/ui components (buttons, dialogs, etc.)
```

### Graph Building Strategies

The fetcher provides three graph building methods:

1. **`buildGraphOptimized()`** (`fetcher.ts:778`): Single API call for documents + parallel block fetching with high concurrency. Best for initial loads.

2. **`buildGraphIncrementalOptimized()`** (`fetcher.ts:962`): Incremental updates using timestamp comparison. Uses search API to discover links efficiently. Best for refresh operations.

3. **`buildGraphStreaming()`** (`fetcher.ts:289`): Legacy streaming approach with callbacks. Preserved for compatibility.

**Always use `buildGraphOptimized()` for initial builds and `buildGraphIncrementalOptimized()` for updates.**

### IndexedDB Caching

Cache structure (see `types.ts:95`):
```typescript
interface GraphCache {
  version: number           // Cache schema version (current: 4)
  timestamp: number         // When cached (for TTL check)
  apiUrl: string           // Craft API URL (for cache key)
  documentCount: number    // Total documents (for change detection)
  documentMetadata: DocumentMetadata[]  // For incremental updates
  graphData: GraphData     // Full graph state
}
```

Cache key: `graph_${hash(apiUrl)}` where hash is a simple string hash function.

TTL: 24 hours (defined in `cache.ts:12`)

### Node Color Coding

Nodes are colored by connection count (see `parser.ts:154`):
- Gray (#94a3b8): No connections (orphan)
- Blue (#60a5fa): 1-2 connections
- Green (#34d399): 3-5 connections
- Yellow (#fbbf24): 6-10 connections
- Red (#f87171): 11+ connections

## Important Implementation Details

### Block ID to Document ID Mapping

Craft documents contain nested block structures. Links can point to either document IDs or specific block IDs within documents. The parser builds a `blockToDocMap` that maps every block ID to its parent document ID (see `parser.ts:42`), enabling document-level graph construction from block-level links.

### API Proxy Headers

All Craft API requests must include these headers:
- `x-craft-url`: Craft API base URL
- `x-craft-key`: Craft API authentication key

The proxy adds `Authorization: Bearer ${craftKey}` when forwarding to Craft API (see `route.ts:31`).

### Concurrent Fetching

Block fetching uses worker pattern with promise queues for controlled concurrency (see `fetcher.ts:849`). Default concurrency: 15 parallel requests. Adjust based on API rate limits if needed.

### Graph Node Relationships

Nodes track both outgoing and incoming links:
- `linksTo`: Array of node IDs this node links to
- `linkedFrom`: Array of node IDs that link to this node

These are rebuilt via `rebuildNodeRelationships()` (see `parser.ts:166`) after graph modifications to ensure consistency.

### SpaceId Resolution

The app needs a Craft `spaceId` to construct clickable links. It attempts to extract this from:
1. `clickableLink` field in document metadata (primary method)
2. `/folders` endpoint response
3. API URL path or query parameters
4. Cached value in `localStorage`

See `fetcher.ts:113` for the full resolution logic.

## Development Notes

- **Path aliases**: Use `@/` prefix for imports (maps to project root via `tsconfig.json:21`)
- **Styling**: Tailwind CSS 4 with `@tailwindcss/postcss` plugin
- **Type safety**: Strict TypeScript mode enabled
- **No tests**: This is a hackathon project without test infrastructure
- **Browser-only code**: Graph library uses `localStorage`, `IndexedDB`, and `window` - ensure proper client-side checks in Next.js components
