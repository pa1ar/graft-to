# plan: granular refresh after tag rename

after tag rename, `refresh()` triggers full incremental rebuild (fetches all docs, diffs timestamps, re-fetches blocks, runs search). redundant — we already patched cache. fix: patch in-memory graph directly, skip all API calls.

result: tag rename = instant in-memory patch + background cache update, zero API calls. refresh button = incremental (unchanged). cache clear = full rebuild (unchanged).

## validation

- `bun test` — all tests pass (existing + new)
- `bun lint` — no lint errors
- `bun build` — compiles

## constraints

- don't break existing refresh/reload behavior
- `patchTagRenameInCache` must still work standalone (cache.ts still owns IndexedDB I/O)
- on partial failure (some docs errored during rename), skip optimistic graph patch — user must refresh manually (cache already cleared on error path)
- preserve force-graph position stability — update in-memory state, don't replace entire graphData object unnecessarily

## context

- existing cache patching logic: `cache.ts:168-233` (`patchTagRenameInCache`)
- in-memory graph state: `hooks/use-craft-graph.ts` (React state)
- tag rename dialog: `components/graph/tag-rename-dialog.tsx` — calls `executeTagRename`, then `patchTagRenameInCache`, then `onRenameComplete` which triggers `refresh()`
- `rebuildNodeRelationships` from `parser.ts` recomputes `linksTo`/`linkedFrom`
- test infra: `bun:test`, existing tests in `lib/graph/__tests__/`
- change detection logic: `fetcher.ts:1398-1425` (duplicated in `buildGraphIncremental` and `buildGraphIncrementalOptimized`)

## tasks

### 1. extract `patchGraphDataForTagRename` pure function

files:
- modify: `lib/graph/tag-rename.ts`
- modify: `lib/graph/cache.ts`

done: `bun test` passes, `patchTagRenameInCache` still works (delegates to new fn)

[x] add `patchGraphDataForTagRename(graphData, renameMap) → GraphData | null` to `tag-rename.ts`
notes: pure function, 65 lines. handles id remapping, link patching, linkCount recomputation, node rename, linkedFrom update

[x] refactor `patchTagRenameInCache` in `cache.ts` to delegate
notes: reduced from 65 lines to 12 lines

### 2. tests for `patchGraphDataForTagRename`

depends on: 1

files:
- modify: `lib/graph/__tests__/tag-rename.test.ts`

done: `bun test lib/graph/__tests__/tag-rename.test.ts` passes

[x] add describe block for `patchGraphDataForTagRename` — 8 test cases
notes: added `makeFullGraphData` helper with doc nodes. all pass

### 3. add `applyTagRename` to useCraftGraph hook

depends on: 1

files:
- modify: `hooks/use-craft-graph.ts`

done: hook exports `applyTagRename`, `bun build` passes

[x] add `applyTagRename(renameMap)` callback — in-memory patch + background cache update
notes: -

[x] return `applyTagRename` from the hook
notes: -

### 4. wire tag rename dialog

depends on: 3

files:
- modify: `components/graph/tag-rename-dialog.tsx`
- modify: `app/page.tsx`

done: `bun build` passes, tag rename dialog no longer calls refresh

[x] change `onRenameComplete` prop type to accept renameMap
notes: -

[x] remove `patchTagRenameInCache` call from `handleExecute`, keep `clearCache` for errors
notes: -

[x] `handleDone`: only call `onRenameComplete(preview.renameMap)` when no errors
notes: on errors, just calls `onClose()` — user must refresh manually

[x] wire in `page.tsx`: `applyTagRename(renameMap)` instead of `refresh()`
notes: -

### 5. extract `detectDocumentChanges` pure function

files:
- modify: `lib/graph/fetcher.ts`

done: `bun build` passes, incremental methods use extracted function

[x] extract `detectDocumentChanges(cachedMetadata, currentDocuments) → { added, modified, deleted }`
notes: replaced in both `buildGraphIncremental` and `buildGraphIncrementalOptimized`

### 6. tests for `detectDocumentChanges`

depends on: 5

files:
- create: `lib/graph/__tests__/fetcher.test.ts`

done: `bun test lib/graph/__tests__/fetcher.test.ts` passes

[x] 9 test cases covering all edge cases
notes: all pass

### 7. skip `discoverLinksViaSearch` when tags enabled

files:
- modify: `lib/graph/fetcher.ts`

done: `bun build` passes, search call skipped when `includeTags: true`

[x] `const searchLinks = includeTags ? new Map() : await this.discoverLinksViaSearch()`
notes: saves 1 API call per incremental refresh
