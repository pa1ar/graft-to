# Changelog

## 0.6.2 - Tag Rename Error Handling

### Fixed
- Blocks with HTML tags or multi-paragraph content (returned by Craft GET but rejected by PUT) are now skipped instead of causing API errors
- Partial success no longer nukes the IndexedDB cache — graph stays intact, refresh rebuilds only what's needed
- Graph patch only applied when all saveable documents succeed, preventing stale visual state

### Improved
- Dialog shows skipped block count with explanation when blocks contain unsupported markdown
- Three-state result icon: green (full success), amber (skips or partial errors), red (total failure)
- `affectedDocumentCount` now includes skip-only documents for accurate progress reporting

### New
- `isBlockMarkdownSafeForPut()` validation for detecting unsafe block content before API calls
- `collectChangedBlocks` returns `{ changed, skipped }` with per-block skip reasons
- 13 new unit tests for markdown safety checks and skip behavior

---

## 0.6.1 - False Tag Filtering

### Fixed
- Hashtags inside social media embeds (Instagram, etc.) no longer appear as graph tags
- Hashtags inside inline code (`#tag`) no longer appear as graph tags
- Skip `richUrl` and `code` block types entirely for tag extraction (embed metadata)
- Strip markdown link text and inline code before hashtag regex runs

### New
- 10 new parser tests covering embed filtering, inline code, and block type guards

---

## 0.6.0 - Interaction Performance

### Improved
- Adjacency index for O(1) node connection lookups (was O(n*m) per node per frame)
- Stable `useCallback` references for color/width functions prevent unnecessary graph re-renders
- Throttled hover events (50ms) reduce state update cascading during mouse movement
- Debounced search input (150ms) avoids filtering all nodes on every keystroke
- `transition-colors` on buttons instead of `transition-all` eliminates layout recalculation
- Map-based node type lookups in graph filtering replace O(n) `.find()` per link

### New
- Extracted `lib/graph/interaction.ts` — pure, testable graph interaction logic (adjacency index, filtering, color helpers)
- 29 new unit tests covering all interaction functions

---

## 0.5.3 - Sponsor & UX Polish

### Improved
- Sponsor link in navbar and rename success screen
- "Made with <3 for Craft by pa1ar" moved from navbar into the "What's Graft?" panel
- "What's Graft?" copy clarified: Graft is read-only by default, write access only for tag renaming
- First Graft link in info panel now points to 1ar.io/tools/graft
- GitHub README: "Donate" badge renamed to "Sponsor" with matching amber color

---

## 0.5.2 - Tag Rename Reliability

### Fixed
- Tag rename now saves per-document instead of one mega-batch — one bad block no longer kills all updates
- Search regex uses RE2-compatible pattern (fixes 400 from Craft search API)
- Error details from Craft API are now logged (were silently discarded)
- Result counts accurately reflect saved vs affected documents
- Partial rename no longer patches graph optimistically — cache is cleared, refresh rebuilds from ground truth

### Improved
- Added direct API mode for server-side usage (Bun tests, scripts)
- Guard against missing API key in direct mode
- Done dialog shows three states: full success, partial success, full failure

### New
- Integration tests against real Craft API (search, single-doc rename, multi-doc rename + revert)
- Sponsor link in navbar, donate badge in README

---

## 0.5.1 - Instant Tag Rename

### Improved
- Tag rename now updates the graph instantly with zero API calls — no loading spinner or progress bar
- Extracted pure `patchGraphDataForTagRename` function for in-memory graph patching
- Extracted `detectDocumentChanges` for cleaner incremental refresh logic
- Incremental refresh skips redundant search API call when tags are enabled (saves 1 call per refresh)

### Fixed
- Tag rename no longer triggers a full incremental rebuild after completing

---

## 0.5.0 - Bulk Tags Rename

### New
- **Tag rename** — right-click any tag node to rename it across your entire Craft space. Renames are applied in parallel, with progress shown per document. Nested tags rename together: renaming `#corp` also renames `#corp/sub` → `#newname/sub`
- **Tag hierarchy in graph** — nested tags now visually connect to their parent with an edge (e.g. `#corp/sub` links back to `#corp`), making tag structure visible in the graph
- **Improved node preview for tags** — clicking a tag shows three distinct sections: Tags (parent), Tags (children), and the document list. Document nodes show which tags they belong to as clickable chips

### Improved
- Node preview links to/from sections are now collapsible
- Document ID hidden for tag and folder nodes (they have no Craft document ID)
- Incremental refresh now syncs tag changes: adding, removing, or renaming a tag in Craft is reflected after clicking Refresh — no full reload needed
- Refresh progress now shows in the Connect panel with a "Refreshing graph" title and live progress bar
- Tag rename dialog: trailing slash shows a grey advisory instead of a red error; caption shows static old tag name instead of live-typed value
- Rename progress message: "Loading block content for document X of N"
- Tag and folder nodes always stay green/blue regardless of connection count

### Fixed
- Stale tag nodes (from renamed tags) are now cleaned up on incremental refresh
- Selected node panel now stays in sync when the graph updates after a refresh
- Parent tag's "Tags (children)" list updates correctly after a child tag is renamed via the Refresh button

---

## 0.4.0 - Compacter Graph

- Add circular boundary force to prevent disconnected nodes from drifting too far, keeping the graph compact and zoom level reasonable
- Add Daily Notes, Unsorted, and Templates as special folder nodes in the graph
- Add rate limiting with global cooldown and automatic retry logic for API calls
- Add progress feedback during folder mapping for better loading UX

---

## 0.3.0 - AI Summarization

- Summarize any note on demand via the Sumr button in the node preview
- No data retention whatsoever — content is not stored on backend
- Request is sent through the gateway straight to the inference service provider
- Service provider aggregator is OpenRouter

---

## 0.2.0 - Tags and Folders

- **Tag & Folder Visualization:** Added hashtag extraction (#tag, #nested/tag) and folder-based graph nodes with star topology clustering. Tags appear in green and folders in blue, both 2x size for easy identification. All three linking types (wikilinks, tags, folders) can be toggled independently with instant client-side filtering
- **Enhanced Bloom Mode:** Implemented ranking-based percentile colorization that creates a balanced rainbow distribution across all connectivity levels, ensuring visual variety even in highly-connected graphs. Documents display purple→blue→green→orange→red gradient based on relative connectivity while tags and folders maintain their signature colors
- **Improved Architecture:** Refined the framework-agnostic graph library with comprehensive tag/folder extraction, optimized the incremental update system to include metadata tracking, and enhanced the demo graph builder to showcase all visualization features including nested tag hierarchies and folder clustering

---

## 0.1.0 - Foundation

- **Interactive Graph Visualizations:** Added interactive 2D and 3D force-directed layouts to visualize Craft document connections, including node previews and graph statistics
- **Privacy & Security:** Implemented a privacy-first architecture where API credentials and note content stay in the browser; includes a pass-through proxy to handle CORS without data logging
- **Performance Optimizations:** Introduced incremental updates using IndexedDB and chronological tracking to re-fetch only modified documents, along with a responsive, mobile-friendly UI
