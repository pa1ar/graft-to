# Graph Library Internals

This directory contains the framework-agnostic graph processing library. It can be extracted and used independently of the Next.js app.

## Module Overview

- **`types.ts`** - TypeScript type definitions for graph data, Craft API responses, and caching
- **`parser.ts`** - Link/tag extraction from markdown and graph building
- **`fetcher.ts`** - Craft API client with optimized parallel fetching
- **`cache.ts`** - IndexedDB caching layer with 24-hour TTL
- **`index.ts`** - Public API exports

## Link Extraction

Documents contain markdown with block links in format `[text](block://BLOCK_ID)`. The parser recursively extracts these from nested block structures.

**Pattern:** `/\[([^\]]+)\]\(block:\/\/([^)]+)\)/g`

**Process:**
1. Fetch all document blocks with `maxDepth=-1`
2. Build `blockToDocMap` mapping every block ID to parent document ID
3. Extract block links from markdown
4. Map block IDs to document IDs for document-level graph
5. Create bidirectional relationships (linksTo/linkedFrom)

See `parser.ts:extractLinksFromBlock()` and `parser.ts:buildGraphData()`

## Tag Extraction

Hashtags are extracted from markdown in format `#tag` or `#nested/tag`.

**Pattern:** `/#([a-zA-Z0-9_]+(?:\/[a-zA-Z0-9_]+)*)/g`

**Nested Tag Handling:**
- `#project/work` creates both `#project` and `#project/work` nodes
- Parent tags are automatically generated for all nested paths
- Example: `#a/b/c` creates `#a`, `#a/b`, and `#a/b/c`

**Implementation:**
```typescript
function extractHashtags(markdown: string): string[] {
  const tags: string[] = [];
  let match;
  while ((match = HASHTAG_REGEX.exec(markdown)) !== null) {
    const fullTag = match[1];
    tags.push(fullTag);

    // For nested tags, create parent tags
    if (fullTag.includes('/')) {
      const parts = fullTag.split('/');
      for (let i = 1; i < parts.length; i++) {
        const parentTag = parts.slice(0, i).join('/');
        if (!tags.includes(parentTag)) {
          tags.push(parentTag);
        }
      }
    }
  }
  return [...new Set(tags)];
}
```

See `parser.ts:extractHashtags()` and `parser.ts:extractTagsFromBlock()`

## Folder Mapping

Folders are fetched from Craft API and documents are mapped to their containing folders.

**Process:**
1. Fetch folder hierarchy via `/folders` endpoint (returns nested structure)
2. Flatten folder tree to get all folder IDs
3. For each folder, fetch documents via `/documents?folderId={id}`
4. Build `docToFolderMap` mapping document IDs to folder IDs
5. Create folder nodes with star topology

**Known Issues:**
- Built-in locations (unsorted, trash, templates, daily_notes) return 400 - expected behavior
- These are filtered out automatically

See `fetcher.ts:fetchFolders()` and `fetcher.ts:buildDocumentToFolderMap()`

## Graph Building Strategies

The fetcher provides three graph building methods:

### 1. `buildGraphOptimized()` (fetcher.ts:778)
**Use for:** Initial loads

**Process:**
- Single API call for all documents
- Parallel block fetching with high concurrency (default: 15)
- Extract tags and folders if `includeTags`/`includeFolders` options enabled
- Build complete graph with all nodes and links
- Return graph data + document metadata for caching

**Options:**
```typescript
{
  signal?: AbortSignal,
  includeTags?: boolean,      // Extract hashtags from markdown
  includeFolders?: boolean,   // Fetch folders and map documents
  callbacks?: {
    onNodesReady?: (nodes: GraphNode[]) => void,
    onLinksDiscovered?: (links: GraphLink[], newNodes?: GraphNode[]) => void,
    onProgress?: (current: number, total: number, message: string) => void,
    onComplete?: (graphData: GraphData) => void,
  }
}
```

### 2. `buildGraphIncrementalOptimized()` (fetcher.ts:962)
**Use for:** Refresh operations

**Process:**
- Compare cached `documentMetadata` with current document list
- Only fetch blocks for added/modified/deleted documents (via timestamp comparison)
- Use `/documents/search` endpoint to discover links without fetching all blocks
- Update existing graph incrementally
- Significantly reduces API calls

**Parameters:**
```typescript
buildGraphIncrementalOptimized(
  cachedMetadata: DocumentMetadata[],
  cachedGraphData: GraphData,
  options: GraphBuildStreamingOptions
)
```

### 3. `buildGraphStreaming()` (fetcher.ts:289)
**Use for:** Legacy compatibility

**Process:**
- Streaming approach with callbacks
- Preserved for backward compatibility
- Prefer `buildGraphOptimized()` for new code

## Star Topology for Tags and Folders

Tags and folders use a **star topology** pattern:
- Tag/folder node is the center
- Connects to ALL documents containing that tag or in that folder
- Creates natural visual clustering

**Implementation:**
```typescript
// Tag node
nodesMap.set(tagId, {
  id: `tag:${tagPath}`,
  title: `#${tagPath}`,
  type: 'tag',
  color: '#34d399',  // Green
  nodeSize: 2,       // 2x size
  metadata: { tagPath, isNestedTag: tagPath.includes('/') }
});

// Create links from tag to all documents
for (const docId of documentIds) {
  linksMap.get(tagId).add(docId);
}
```

## Block ID to Document ID Mapping

Craft documents contain nested block structures. Links can point to either document IDs or specific block IDs.

**Solution:**
Build `blockToDocMap` that maps every block ID to its parent document ID:

```typescript
const blockToDocMap = new Map<string, string>();

function addBlocksToMap(blocks: CraftBlock[], docId: string) {
  for (const block of blocks) {
    blockToDocMap.set(block.id, docId);
    if (block.content) {
      addBlocksToMap(block.content, docId);
    }
  }
}
```

This enables document-level graph construction from block-level links.

See `parser.ts:buildGraphData()`

## IndexedDB Caching

Cache structure (see `types.ts:95`):

```typescript
interface GraphCache {
  version: number                    // Cache schema version (current: 4)
  timestamp: number                  // When cached (for TTL check)
  apiUrl: string                     // Craft API URL (for cache key)
  documentCount: number              // Total documents (for change detection)
  documentMetadata: DocumentMetadata[] // For incremental updates
  graphData: GraphData               // Full graph state
}
```

**Cache Key:** `graph_${hash(apiUrl)}` where hash is a simple string hash function

**TTL:** 24 hours (defined in `cache.ts:12`)

**Operations:**
- `getCachedGraph(apiUrl)` - Get cached graph data if valid
- `getCachedGraphWithMetadata(apiUrl)` - Get graph + metadata for incremental updates
- `setCachedGraph(apiUrl, graphData, metadata)` - Store graph with metadata

## Incremental Updates

Incremental updates use chronological tracking to minimize API calls:

1. Store `lastModifiedAt` timestamps in IndexedDB
2. Compare cached timestamps against current document state
3. Only fetch blocks for changed documents
4. Use `/documents/search` with regex to discover links efficiently
5. Update graph incrementally, preserving unchanged parts

**Benefits:**
- Significantly reduces API calls (only changed documents)
- Faster refresh operations
- Lower bandwidth usage
- Better user experience

See `fetcher.ts:buildGraphIncrementalOptimized()`

## Concurrent Fetching

Block fetching uses a worker pattern with promise queues for controlled concurrency.

**Default concurrency:** 15 parallel requests

**Implementation:** `fetcher.ts:849`

Adjust based on API rate limits if needed.

## Color Preservation Pattern

When updating graph data, preserve custom colors for tags and folders:

```typescript
const finalNodes = nodes.map(node => ({
  ...node,
  linkCount,
  // Preserve existing color for tags/folders
  color: node.color || calculateNodeColor(linkCount),
}));
```

**Why:** Tag (green) and folder (blue) colors should not be overwritten by link-count-based colors.

**Where:** `hooks/use-craft-graph.ts` in both `loadGraph()` and `refreshGraph()`

## Node Relationships

Nodes track both outgoing and incoming links:
- `linksTo`: Array of node IDs this node links to
- `linkedFrom`: Array of node IDs that link to this node

These are rebuilt via `rebuildNodeRelationships()` (see `parser.ts:166`) after graph modifications to ensure consistency.

## SpaceId Resolution

The app needs a Craft `spaceId` to construct clickable links. It attempts to extract this from:

1. `clickableLink` field in document metadata (primary method)
2. `/folders` endpoint response
3. API URL path or query parameters
4. Cached value in `localStorage`

See `fetcher.ts:113` for the full resolution logic.
