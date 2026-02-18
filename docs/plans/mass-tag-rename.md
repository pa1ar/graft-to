# Mass Tag Rename - Implementation Plan

## Overview

Add the ability to select a tag node in the graph, click "Edit", enter a new tag name, see a confirmation dialog with affected document count and risk warning, then perform the rename by updating block markdown across all affected documents via the Craft API.

Nested tags are supported: renaming `#main` to `#mainNew` will also update `#main/sub1` → `#mainNew/sub1`, etc. Renaming `#main/subOld` to `#main/subNew` only affects that specific subtag segment.

---

## Step 1: Extend the API Proxy to Support PUT Requests

**File:** `app/api/craft/[...path]/route.ts`

Currently only exports a `GET` handler. Add a `PUT` handler that:
- Reads `x-craft-url` and `x-craft-key` from headers (same as GET)
- Forwards the request body (JSON) to the Craft API with `Authorization: Bearer` header
- Returns the Craft API response

This is needed because the Craft `PUT /blocks` endpoint is how we update block markdown content.

---

## Step 2: Add Block Update Method to Fetcher

**File:** `lib/graph/fetcher.ts`

Add a new method `updateBlocks()` to `CraftGraphFetcher`:

```typescript
async updateBlocks(
  documentId: string,
  blocks: Array<{ id: string; markdown: string }>,
  signal?: AbortSignal
): Promise<void>
```

This calls `PUT /blocks` via the proxy with the document ID and updated block data. The Craft API `PUT /blocks` supports partial updates (only provided fields are updated) and accepts arrays for bulk updates.

Also add a private `fetchAPIPut()` helper (similar to `fetchAPI` but sends PUT with a JSON body).

Export `updateBlocks` capability via `lib/graph/index.ts` (already re-exports all from fetcher).

---

## Step 3: Create Tag Rename Service

**New file:** `lib/graph/tag-rename.ts`

Core logic for computing and executing a tag rename. Functions:

### `computeTagRename(oldTagPath, newTagPath, graphData)`
Pure function that analyzes the rename without side effects. Returns:
```typescript
{
  affectedDocumentIds: string[]      // Documents that need updating
  affectedTagPaths: string[]         // All tag paths that will change (including nested children)
  renameMap: Map<string, string>     // oldPath → newPath for each affected tag
  isParentRename: boolean            // Whether this renames a parent tag (affects children)
}
```

Logic:
- From `graphData`, find all tag nodes whose `tagPath` starts with `oldTagPath` (or equals it exactly)
- For each, compute the new path by replacing the matching prefix
- Collect all document IDs linked from those tag nodes (via `linkedFrom` on tag nodes, or by following graph links)

### `buildBlockReplacements(oldTagPath, newTagPath, markdown)`
Takes a block's markdown string and returns the updated markdown with tags renamed.

Uses a regex replacement that:
- Matches `#oldTagPath` followed by `/` (nested continuation), word boundary, or end-of-string
- Replaces the matched portion with `#newTagPath`
- Handles edge cases: tag at end of line, tag followed by space/punctuation, tag followed by `/subtag`

For a parent rename (e.g., `#main` → `#mainNew`):
- `#main` → `#mainNew`
- `#main/sub1` → `#mainNew/sub1`
- `#main/sub1/deep` → `#mainNew/sub1/deep`
- Does NOT touch `#mainother` (must match at word/segment boundary)

For a subtag rename (e.g., `#main/subOld` → `#main/subNew`):
- `#main/subOld` → `#main/subNew`
- `#main/subOld/deep` → `#main/subNew/deep`
- Does NOT touch `#main/subOld2` (exact segment match)

### `executeTagRename(fetcher, oldTagPath, newTagPath, documentIds, onProgress)`
Orchestrates the actual rename:
1. For each affected document, fetch its blocks (re-fetch to get fresh data)
2. Walk the block tree, find blocks whose markdown contains the old tag
3. Compute new markdown for each affected block
4. Call `fetcher.updateBlocks()` for each document's changed blocks
5. Report progress via callback

---

## Step 4: Add "Rename Tag" Button to Node Preview

**File:** `components/graph/node-preview.tsx`

When `node.type === 'tag'`:
- Show a "Rename Tag" button (alongside existing buttons, or replacing the disabled "Sumr" button area)
- Button is disabled if viewing demo graph (no API credentials)
- Clicking opens the rename dialog (Step 5)

Pass new props from `page.tsx`:
- `onTagRename?: (node: GraphNode) => void`

---

## Step 5: Create Tag Rename Dialog Component

**New file:** `components/graph/tag-rename-dialog.tsx`

A modal dialog using existing `AlertDialog` (from shadcn/ui, already imported in graph-controls.tsx). Contains:

### Initial State (Input)
- Text input pre-filled with current tag path (without `#` prefix)
- Label showing "Rename #oldTag to:"
- Input validated against the tag regex pattern `[a-zA-Z0-9_]+(?:\/[a-zA-Z0-9_]+)*`

### Confirmation State (Preview)
After user enters new name and clicks "Preview Changes":
- Show number of documents that will be affected
- Show list of tag path transformations (old → new) for nested tags
- Warning text: "This will modify block content in your Craft documents. This operation cannot be undone from Graft. Make sure you have a backup or can revert changes in Craft."
- "Cancel" and "Rename" buttons

### Executing State
- Progress indicator showing "Updating document X of Y..."
- Cancel button (abort remaining updates)

### Completion State
- Success message: "Renamed #old to #new across X documents"
- "Done" button that closes dialog and triggers graph refresh

---

## Step 6: Wire Up State Management in Page

**File:** `app/page.tsx`

- Add state for tag rename dialog: `tagRenameNode: GraphNode | null`
- Pass `onTagRename` callback to `NodePreview`
- Render `TagRenameDialog` when `tagRenameNode` is set
- On rename completion: call `refresh()` (from `useCraftGraph`) to rebuild graph with updated tags
- Clear cache for the current API URL so the graph is rebuilt fresh

---

## Step 7: Cache Invalidation After Rename

**Files:** `hooks/use-craft-graph.ts`, `lib/graph/cache.ts`

After a successful rename:
1. Clear the cached graph (`clearCache(apiUrl)`)
2. Force a full graph reload (`reload()`) rather than incremental refresh, since the underlying block content has changed and incremental refresh might miss tag-only changes

---

## File Change Summary

| File | Change |
|------|--------|
| `app/api/craft/[...path]/route.ts` | Add `PUT` handler |
| `lib/graph/fetcher.ts` | Add `updateBlocks()` method and `fetchAPIPut()` helper |
| `lib/graph/tag-rename.ts` | **New file** - rename computation and execution logic |
| `lib/graph/index.ts` | Re-export from `tag-rename.ts` |
| `components/graph/node-preview.tsx` | Add "Rename Tag" button for tag nodes |
| `components/graph/tag-rename-dialog.tsx` | **New file** - rename dialog UI |
| `app/page.tsx` | Wire up tag rename state and dialog |

---

## Key Design Decisions

1. **No batch API for tag rename** - Must update blocks individually per document. Use controlled concurrency (same pattern as block fetching: 5 parallel requests with rate limit handling).

2. **Re-fetch blocks before rename** - Don't rely on potentially stale cached data. Fetch fresh blocks for each document before modifying, to avoid overwriting recent changes.

3. **Segment-boundary matching** - The regex must match tag segments precisely. `#main` should not match inside `#maintenance`. We match `#oldTag` followed by `/`, space, punctuation, or end-of-string.

4. **Parent vs subtag rename** - Determined automatically. If the old path has no `/`, it's a root tag rename. If it has `/`, only the specific path segment is replaced. Both cases use the same prefix-replacement logic.

5. **Force full reload after rename** - Incremental refresh compares `lastModifiedAt` timestamps but tag changes modify block content, which should update those timestamps. However, to be safe, we clear cache and do a full reload.

6. **Risk warning** - Important since there's no undo. The confirmation dialog must be explicit about what's happening and how many documents are affected.
