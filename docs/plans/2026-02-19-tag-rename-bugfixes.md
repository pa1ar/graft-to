# plan: tag rename reliability fixes

tag rename batch PUT returns 400, partial application with no visibility. search regex uses unsupported lookahead. progress counts are misleading. fix: per-document PUT, RE2-safe regex, better error logging, accurate counts.

## validation

- `bun test` — all tests pass
- `bun run build` — compiles
- manual: rename a tag across 5+ docs, verify all update and counts match

## constraints

- don't change the Phase A (parallel fetch) pattern — it works fine
- keep the fallback path: search fails → use graph data. but make search actually work
- preserve abort/cancel behavior
- `patchGraphDataForTagRename` and `applyTagRename` (in-memory patching) are unaffected — only the API execution path changes

## context

- tag rename execution: `lib/graph/tag-rename.ts:226-327` (`executeTagRename`)
- search regex: `lib/graph/fetcher.ts:364-380` (`findDocumentsWithTag`)
- PUT helper: `lib/graph/fetcher.ts:297-345` (`fetchAPIPut`)
- error class: `lib/graph/fetcher.ts:21-30` (`CraftAPIError`)
- dialog: `components/graph/tag-rename-dialog.tsx`
- Craft API: `PUT /blocks` uses `anyOf` validation across 12 block types, `additionalProperties: false` on each — if a block is non-text (code, image, etc.) and we send `{id, markdown}`, it rejects
- Craft API: `GET /documents/search` uses RE2 regex — lookaheads NOT actually supported despite docs claiming otherwise

## bugs from console output

```
/api/craft/documents/search?regexps=%23topic%2Fclaude%28%3F%3D%2F%7C%5B%5Ea-zA-Z0-9_%5D%7C%24%29
→ 400 (regex uses lookahead, RE2 doesn't support it)

/api/craft/blocks → PUT 400
→ batch of ALL changed blocks from all docs. one bad block kills entire batch.
→ Craft partially applied updates before failing → 16/17 docs renamed, 2 left behind.
→ error details (response body) never logged — CraftAPIError.response ignored.

result shown: "17 docs updated, 0 blocks modified, 1 error"
→ "17 docs updated" = docs with matching blocks (Phase B), not docs actually saved
→ "0 blocks modified" = blocks from successful PUT (Phase C failed)
→ misleading — nothing was "updated" from the user's perspective
```

## tasks

### 1. fix search regex — remove lookahead

files:
- modify: `lib/graph/fetcher.ts`

done: `bun test` passes, search regex doesn't use lookahead

[x] replace `(?=/|[^a-zA-Z0-9_]|$)` in `findDocumentsWithTag` with RE2-compatible alternative
notes: used `#tag([^a-zA-Z0-9_/]|/|$)` — consuming boundary is fine for search-only

### 2. per-document PUT instead of mega-batch

files:
- modify: `lib/graph/tag-rename.ts`

done: `bun test` passes, `bun run build` compiles. each document's blocks are PUT separately.

[x] refactor Phase C: iterate per-document instead of all-blocks-in-one-batch
notes: renamed to Phase B. each doc's blocks sent via separate `updateBlocks` call. errors tracked with actual docId.

[x] add `WRITE_CONCURRENCY` (e.g. 3) for parallel per-doc PUT
notes: `WRITE_CONCURRENCY = 3`, reuses worker pool pattern from Phase A

### 3. log full error details

files:
- modify: `lib/graph/fetcher.ts`

done: `bun run build` compiles. error logs include response body.

[x] in `fetchAPIPut`: include response body excerpt in the error message itself
notes: parses proxy JSON wrapper to extract `details` field. error message now: `API PUT request failed (400): <actual craft error>`. same in `fetchAPI` for GET errors.

[x] in `executeTagRename` catch blocks: error message now includes the details (propagated from fetchAPIPut)
notes: no separate `.response` logging needed — details are in err.message now

### 4. fix misleading result counts and wording

files:
- modify: `lib/graph/tag-rename.ts`
- modify: `components/graph/tag-rename-dialog.tsx`

done: `bun run build` compiles. result summary accurately reflects what happened.

[x] rename `TagRenameResult` fields: `affectedDocumentCount`, `savedDocumentCount`, `savedBlockCount`
notes: -

[x] update dialog done-phase text to show accurate summary
notes: "X of Y documents saved, Z blocks modified". three states: success (green check), partial success (amber warning), full failure (red warning).

[x] if errors > 0 but some succeeded: show partial success state
notes: `handleDone` now patches graph when `savedDocumentCount > 0` (was: only on zero errors). cache still cleared on any errors for ground-truth rebuild on refresh.

### 5. tests for per-document PUT flow

files:
- modify: `lib/graph/__tests__/tag-rename.test.ts`

done: `bun test` passes

[ ] add tests for `executeTagRename` with mocked fetcher — happy path, partial failure, full failure
notes: deferred — need to test manually first to see if per-doc PUT resolves the 400

## dependency order

```
Task 1                 (independent) — DONE
Task 2 → Task 4       (counts depend on per-doc structure) — DONE
Task 3                 (independent) — DONE
Task 5                 (after tasks 2+4) — PENDING
```
