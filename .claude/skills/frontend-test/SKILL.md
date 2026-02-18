---
name: frontend-test
description: Run frontend tests for Graft via Chrome browser automation. Broken into sections — pick any combination, create a todo list, and execute. Invoke with /frontend-test and optionally specify which sections (e.g. "/frontend-test setup rename-validation rename-nested-to-flat"). If no sections specified, run all.
allowed-tools: Read, Bash, mcp__claude-in-chrome__tabs_context_mcp, mcp__claude-in-chrome__tabs_create_mcp, mcp__claude-in-chrome__navigate, mcp__claude-in-chrome__computer, mcp__claude-in-chrome__javascript_tool, mcp__claude-in-chrome__find, mcp__claude-in-chrome__form_input, mcp__claude-in-chrome__zoom, mcp__claude-in-chrome__get_page_text, TaskCreate, TaskUpdate, TaskList
---

# Graft Frontend Test Skill

## How to Use

When invoked, determine which sections to run based on args (or all if none). Create a TaskCreate entry per section, then execute each using Chrome automation, marking done/fail as you go.

**Available sections:**
- `setup` — connect API, enable tags + labels
- `tag-graph` — verify green tag nodes, hierarchy edges
- `node-preview-doc` — document node preview correctness
- `node-preview-tag-leaf` — leaf tag node preview
- `node-preview-tag-parent` — parent tag preview (children section)
- `rename-validation` — dialog input validation (special chars, trailing slash, nested)
- `rename-flat-to-flat` — rename non-nested → non-nested
- `rename-nested-to-flat` — rename nested → non-nested (child loses parent)
- `rename-flat-to-nested` — rename non-nested → nested (gains parent)
- `rename-parent` — rename parent tag (all children renamed too)
- `refresh-incremental` — edit tag in Craft, refresh, verify update
- `refresh-progress` — verify "Refreshing graph" title + progress bar in Connect panel

---

## Setup Notes

**Dev server:** ensure `bun run dev` is running on :3000 before starting.

**Credentials:** read from `.env` — `API_URL` and `API_KEY`.

**Connecting via JS** (form_input doesn't always persist through React state):
```javascript
const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
const urlInput = document.querySelector('input[type="url"]');
const keyInput = document.querySelector('input[type="password"]');
nativeSet.call(urlInput, 'API_URL_VALUE');
urlInput.dispatchEvent(new Event('input', { bubbles: true }));
nativeSet.call(keyInput, 'API_KEY_VALUE');
keyInput.dispatchEvent(new Event('input', { bubbles: true }));
```
Then click Save connection by coordinate (not ref — avoids chrome-extension URL redirect bug).

**Graph loads in ~2 min** on first load. Check for absence of "Loading graph" panel before proceeding.

---

## Section Definitions

### `setup`
**Goal:** App connected, tags visible, labels visible.

Steps:
1. Get tab context, navigate to http://localhost:3000
2. Read credentials from `.env`
3. Fill form via JS nativeSet pattern, click Save connection (~176, 381)
4. Wait 30s, screenshot — check "Loading graph" message visible
5. Wait 30s more, screenshot — check loading panel gone, nodes present
6. Click Customize icon (4th icon in toolbar, ~163, 75)
7. Click "Show" labels button
8. Click "Tags" toggle to enable
9. Close Customize panel
10. Screenshot — verify green tag nodes visible with labels

Pass: green nodes visible, labels showing on graph.

---

### `tag-graph`
**Goal:** Tag nodes are green, hierarchy edges connect parent→child.

Steps:
1. Zoom into tag cluster (scroll up on tag area)
2. Screenshot
3. Verify: tag nodes are green (#34d399 color), NOT grey
4. Verify: hierarchy edge visible between a parent tag (e.g. `#corp`) and its child (e.g. `#corp/sub`)
5. Zoom in closer if needed

Pass: green color confirmed, at least one parent→child edge visible.

---

### `node-preview-doc`
**Goal:** Document node preview shows tags section, collapsible links, no Document ID for tags.

Steps:
1. Click any document node (grey node)
2. Screenshot right panel
3. Verify: panel shows title, "document" badge, connection count
4. Verify: "Document ID" field present with UUID
5. If doc has tags: "Tags (N)" section appears above Links to/from with green chip buttons
6. Click "Links to (N)" header — list collapses
7. Click again — list expands
8. Same for "Linked from (N)"

Pass: doc ID shown, tags as chips if any, links collapsible.

---

### `node-preview-tag-leaf`
**Goal:** Leaf tag node preview is correct.

Steps:
1. Click a leaf tag node (green, no children)
2. Screenshot right panel
3. Verify: title starts with `#`, badge shows "tag"
4. Verify: NO "Document ID" section
5. Verify: "Rename Tag" button present
6. If nested: "Tags (parent)" section shows parent chip
7. If not nested: no "Tags (parent)" section
8. Verify: NO "Tags (children)" section
9. Verify: "Links to (N)" shows documents

Pass: all above hold.

---

### `node-preview-tag-parent`
**Goal:** Parent tag node shows correct children.

Steps:
1. Click a parent tag node (green, larger — hub of nested tags)
2. Screenshot right panel
3. Verify: "Tags (children)" section present with child tag chips
4. Verify: child tags match what's visible as hierarchy children in the graph
5. Click a child chip — panel updates to that child tag

Pass: children listed correctly, navigation works.

---

### `rename-validation`
**Goal:** Input validation works correctly in rename dialog.

Steps:
1. Click any tag node → click "Rename Tag"
2. Screenshot (initial state: old tag name pre-filled, caption shows old tag static)
3. Clear input, type `corp @invalid`
   - Verify: red error "Tag names can only contain letters, numbers, underscores, and slashes"
   - Verify: Preview Changes disabled
4. Clear, type `newname/`
   - Verify: grey advisory "Continue typing to complete the nested tag name." (NOT red)
   - Verify: Preview Changes disabled
5. Continue typing `sub` (input now `newname/sub`)
   - Verify: advisory disappears, no error
   - Verify: Preview Changes enabled
6. Clear, type same name as current tag
   - Verify: Preview Changes disabled (unchanged)
7. Press Escape or Cancel

Pass: all validation states correct.

---

### `rename-flat-to-flat`
**Goal:** Rename a non-nested tag to another non-nested name. Graph updates.

Pick a leaf non-nested tag (e.g. `#internal`).

Steps:
1. Click tag → Rename Tag
2. Clear input, type new non-nested name (e.g. `internalv2`)
3. Click Preview Changes
4. Verify confirm screen: correct doc count, correct mapping shown (`#internal → #internalv2`)
5. Click Rename
6. Screenshot during execution — verify progress message "Loading block content for document X of N…"
7. Wait for completion
8. Verify done screen: X documents updated, X blocks modified
9. Click Done, wait ~15s for graph reload
10. Verify: `#internalv2` green node present in graph, `#internal` gone
11. Click `#internalv2` node — verify title, no parent section (leaf), correct doc count

Pass: rename executed, graph updated, node preview correct.

---

### `rename-nested-to-flat`
**Goal:** Rename a nested tag (e.g. `#corp/sub`) to a flat name. Parent's children section updates.

Steps:
1. Identify a nested tag (has `/` in name)
2. Note its parent tag name
3. Click nested tag → Rename Tag
4. Type flat name (no `/`), Preview Changes, Rename
5. Wait for graph reload
6. Click parent tag — verify "Tags (children)" no longer includes the renamed tag
7. Click new flat tag — verify no "Tags (parent)" section
8. Verify old nested tag node gone from graph

Pass: hierarchy correctly removed after rename.

---

### `rename-flat-to-nested`
**Goal:** Rename a flat tag to a nested name under an existing parent. Hierarchy created.

Steps:
1. Identify a flat (non-nested) tag
2. Note the name of an existing parent tag to nest under (e.g. `#corp`)
3. Click flat tag → Rename Tag
4. Type `existingparent/newchild`, Preview Changes, Rename
5. Wait for graph reload
6. Click parent tag — verify "Tags (children)" now includes the new child
7. Click new child tag — verify "Tags (parent)" shows the parent
8. Verify hierarchy edge visible in graph

Pass: hierarchy created correctly after rename.

---

### `rename-parent`
**Goal:** Renaming a parent tag renames all children too.

Steps:
1. Identify a parent tag with at least one child (e.g. `#corp` with `#corp/sub`)
2. Note all child tag names
3. Click parent tag → Rename Tag
4. Type new name (e.g. `newcorp`), Preview Changes
5. Verify confirm screen shows ALL affected tags: `#corp → #newcorp`, `#corp/sub → #newcorp/sub`
6. Click Rename, wait for completion
7. Verify done screen: correct counts
8. Wait for graph reload
9. Verify: `#newcorp` present, `#newcorp/sub` present, old names gone
10. Click `#newcorp` — verify Tags (children) shows `#newcorp/sub`
11. Click `#newcorp/sub` — verify Tags (parent) shows `#newcorp`

Pass: parent + all children renamed, hierarchy preserved.

---

### `refresh-incremental`
**Goal:** Editing a tag in Craft and refreshing Graft reflects the change without full reload.

Pre-condition: manually edit a document in Craft to change a tag (e.g. `#corp/orrr` → `#corp/op`).

Steps:
1. Note the current tag name in Graft graph
2. (User edits tag in Craft app — cannot be automated)
3. Click Refresh button (last icon in toolbar)
4. Wait ~30s
5. Verify: old tag node gone, new tag node present
6. Click parent tag — verify Tags (children) updated (old child gone, new child present)
7. Click new tag node — verify Tags (parent) correct

Pass: incremental refresh reflects Craft changes correctly.

---

### `refresh-progress`
**Goal:** Refresh button shows "Refreshing graph" title + progress in Connect panel.

Pre-condition: there must be actual changes (incremental refresh with no changes shows nothing).

Steps:
1. Open Connect panel (plug icon, 1st icon)
2. Click Refresh button immediately
3. Screenshot quickly — verify Connect panel shows:
   - Title: "Refreshing graph" (NOT "Loading graph")
   - Progress message visible
   - Progress bar advancing
4. Wait for completion
5. Verify panel returns to normal state (no progress bar)

Pass: "Refreshing graph" title shown, progress visible during refresh.

---

## Reporting

After all sections complete, output a table:

| Section | Result | Notes |
|---------|--------|-------|
| setup | ✓ Pass / ✗ Fail | ... |
| ... | ... | ... |

Flag any failures with screenshots and specific observations.
