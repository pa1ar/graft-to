# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Graft is a graph visualization tool for Craft documents. It creates interactive 2D and 3D force-directed graphs showing how documents relate through links, tags, and folders. The app runs entirely in the browser with a privacy-first proxy architecture.

Built for the Craft hackathon with clean architecture for potential integration by Craft team.

## Common Commands

```bash
# Development
bun install        # Install dependencies
bun dev           # Start development server (http://localhost:3000)

# Production
bun build         # Build for production
bun start         # Start production server

# Demo graph
API_URL='...' API_KEY='...' bun scripts/build-demo-graph.ts

# Linting
bun lint          # Run ESLint
```

## Tech Stack
- **Runtime**: Next.js 16 (App Router) on Bun
- **Graph Rendering**: react-force-graph-2d & react-force-graph-3d
- **UI Framework**: shadcn/ui components with Tailwind CSS 4
- **Storage**: IndexedDB for client-side caching (24-hour TTL)
- **Analytics**: Vercel Analytics
- **Deployment**: Vercel with `bunVersion: "1.x"`

## Architecture Principles

### 1. Privacy-First Proxy
The app uses a CORS proxy pattern to enable browser-to-Craft API communication:

- **Client stores credentials**: API URL and key stored in `localStorage` (never sent to server for storage)
- **Proxy forwards requests**: `/api/craft/[...path]` route forwards requests to Craft API with credentials from request headers
- **No server-side persistence**: Credentials exist only in request headers, never logged or stored on server

See `app/api/craft/[...path]/route.ts:1` for the proxy implementation.

**API Proxy Headers:**
- `x-craft-url`: Craft API base URL
- `x-craft-key`: Craft API authentication key

The proxy adds `Authorization: Bearer ${craftKey}` when forwarding to Craft API.

### 2. Framework-Agnostic Graph Library
`lib/graph/` is standalone and reusable - can be extracted and used independently:

```typescript
import { createFetcher } from '@/lib/graph'

const fetcher = createFetcher(apiUrl, apiKey)
const graph = await fetcher.buildGraphOptimized({
  includeTags: true,
  includeFolders: true,
  callbacks: {
    onProgress: (current, total, message) => {
      console.log(`${current}/${total}: ${message}`)
    }
  }
})
```

See [`lib/graph/CLAUDE.md`](lib/graph/CLAUDE.md) for detailed internals.

### 3. Progressive Loading
Graph builds with progress feedback via streaming callbacks for better UX during initial load and refresh operations.

## Key Directories

```
app/
├── page.tsx              # Main graph visualization page
├── layout.tsx            # Root layout with analytics, theme
└── api/craft/[...path]/  # Craft API proxy (GET requests only)

components/
├── graph/                # Graph visualization components
│   └── CLAUDE.md         # Visualization-specific docs
├── ui/                   # shadcn/ui components
└── header.tsx            # App header with settings

lib/
└── graph/                # Framework-agnostic graph library
    └── CLAUDE.md         # Graph library internals docs

hooks/
└── use-craft-graph.ts    # Graph data management hook

scripts/
└── build-demo-graph.ts   # Demo graph builder
```

## Core Modules

### Graph Library (`lib/graph/`)
Framework-agnostic graph processing. See [`lib/graph/CLAUDE.md`](lib/graph/CLAUDE.md) for:
- Link/tag/folder extraction patterns
- Caching and incremental updates
- Graph building strategies
- Data structures and types

### Graph Visualization (`components/graph/`)
2D/3D rendering with react-force-graph. See [`components/graph/CLAUDE.md`](components/graph/CLAUDE.md) for:
- Color systems and bloom mode
- Node sizing and visual design
- Client-side filtering rationale
- Tag and folder visualization

## Craft API Integration

- **Documents**: Fetched via `/documents` endpoint
- **Blocks**: Via `/blocks?id={docId}&maxDepth=-1`
- **Folders**: Via `/folders` endpoint
- **Links**: Extracted from markdown using `block://` regex pattern
- **Tags**: Extracted from markdown using hashtag regex
- **Bidirectional mapping**: For graph relationships

## Security & Privacy

- No server-side storage of user data
- API credentials passed via headers only (never stored server-side)
- Proxy route forwards requests without logging
- No database, no data retention
- All processing happens client-side
- Cache stored only in browser's IndexedDB

## Development Notes

- **Path aliases**: Use `@/` prefix for imports (maps to project root)
- **Styling**: Tailwind CSS 4 with `@tailwindcss/postcss` plugin
- **Type safety**: Strict TypeScript mode enabled
- **No tests**: This is a hackathon project without test infrastructure
- **Browser-only code**: Graph library uses `localStorage`, `IndexedDB`, and `window` - ensure proper client-side checks in Next.js components
- **Bun runtime**: Use `bun` commands instead of `npm` (see `package.json` scripts)
- **Hydration**: Use `suppressHydrationWarning` on `<html>` for theme initialization

## Bun-Specific Guidance

Default to using Bun instead of Node.js:
- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun install` instead of `npm install`
- Use `bun run <script>` instead of `npm run <script>`
- Bun automatically loads `.env`, so don't use dotenv
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile where applicable

## Deployment

- **Platform**: Vercel
- **Config**: `vercel.json` specifies `bunVersion: "1.x"`
- **Environment**: Production build uses Next.js static export with Bun runtime
