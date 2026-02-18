# Changelog

## 0.5.0 - Tag Rename & Hierarchy

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
