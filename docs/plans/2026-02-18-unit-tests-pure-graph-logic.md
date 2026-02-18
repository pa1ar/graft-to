# Unit Tests — Pure Graph Logic Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Bun test suite covering the pure, browser-free logic in `lib/graph/` — specifically `tag-rename.ts` and `parser.ts` — with zero mocking required.

**Architecture:** Bun has a built-in test runner (`bun test`) — no extra dependencies needed. Tests live in `lib/graph/__tests__/`. Only pure functions are tested; browser-bound modules (`fetcher.ts`, `cache.ts`) are out of scope for this plan.

**Tech Stack:** Bun test runner (built-in), TypeScript (already configured)

---

## Context: What to Test

### `lib/graph/tag-rename.ts`
| Function | Exported | Testable |
|---|---|---|
| `computeTagRenameMap` | yes | yes — pure graph traversal |
| `computeTagRename` | yes | yes — pure graphData scan |
| `applyTagRenameToMarkdown` | yes | yes — pure regex |
| `collectChangedBlocks` | **no** | needs export first |

### `lib/graph/parser.ts`
| Function | Exported | Testable |
|---|---|---|
| `extractHashtags` | yes | yes — pure regex |
| `extractTagsFromBlock` | yes | yes — pure tree walk |
| `extractBlockLinks` | yes | yes — pure regex |
| `extractLinksFromBlock` | yes | yes — pure tree walk |

### Key edge cases to cover
- `applyTagRenameToMarkdown`: boundary matching (don't rename `#corporationX` when renaming `#corporation`), nested tags, multiple occurrences, no match, special chars in tag path
- `computeTagRenameMap`: parent + children renamed, unrelated tags untouched, tag not in graph still included
- `computeTagRename`: reads correct doc IDs from links array, handles resolved link objects `{id: ...}` as well as string source/target
- `extractHashtags`: simple tag, nested tag creates parents, dedup, no false positives in code blocks

---

## Task 1: Export `collectChangedBlocks`

`collectChangedBlocks` is the function that actually decides which blocks get PUTted — it must be tested.

**Files:**
- Modify: `lib/graph/tag-rename.ts:106`

**Step 1: Export the function**

Change line 106 from:
```typescript
function collectChangedBlocks(
```
to:
```typescript
export function collectChangedBlocks(
```

**Step 2: Verify TypeScript still compiles**

```bash
bun tsc --noEmit
```
Expected: no output (clean).

**Step 3: Commit**

```bash
git add lib/graph/tag-rename.ts
git commit -m "feat: export collectChangedBlocks for testing"
```

---

## Task 2: Scaffold test infrastructure

**Files:**
- Create: `lib/graph/__tests__/tag-rename.test.ts`
- Create: `lib/graph/__tests__/parser.test.ts`
- Modify: `package.json`

**Step 1: Add test script to `package.json`**

In the `"scripts"` section, add:
```json
"test": "bun test"
```

**Step 2: Create test directory**

```bash
mkdir -p lib/graph/__tests__
```

**Step 3: Create empty test files with one smoke test each**

`lib/graph/__tests__/tag-rename.test.ts`:
```typescript
import { describe, expect, test } from 'bun:test';
import { applyTagRenameToMarkdown } from '../tag-rename';

describe('tag-rename', () => {
  test('smoke', () => {
    expect(applyTagRenameToMarkdown('a', 'b', '#a')).toBe('#b');
  });
});
```

`lib/graph/__tests__/parser.test.ts`:
```typescript
import { describe, expect, test } from 'bun:test';
import { extractHashtags } from '../parser';

describe('parser', () => {
  test('smoke', () => {
    expect(extractHashtags('#hello')).toEqual(['hello']);
  });
});
```

**Step 4: Run tests — verify they pass**

```bash
bun test
```
Expected: 2 tests pass, 0 fail.

**Step 5: Commit**

```bash
git add package.json lib/graph/__tests__/
git commit -m "chore: scaffold bun test suite for pure graph logic"
```

---

## Task 3: Tests for `applyTagRenameToMarkdown`

This is the highest-risk function — a regex bug silently corrupts Craft documents.

**Files:**
- Modify: `lib/graph/__tests__/tag-rename.test.ts`

**Step 1: Replace smoke test with full suite**

```typescript
import { describe, expect, test } from 'bun:test';
import { applyTagRenameToMarkdown } from '../tag-rename';

describe('applyTagRenameToMarkdown', () => {
  test('renames exact match at end of string', () => {
    expect(applyTagRenameToMarkdown('corp', 'company', '#corp')).toBe('#company');
  });

  test('renames exact match followed by space', () => {
    expect(applyTagRenameToMarkdown('corp', 'company', 'tagged #corp here')).toBe('tagged #company here');
  });

  test('renames multiple occurrences', () => {
    expect(applyTagRenameToMarkdown('corp', 'company', '#corp and #corp')).toBe('#company and #company');
  });

  test('does not rename prefix match — #corporation stays when renaming #corp', () => {
    expect(applyTagRenameToMarkdown('corp', 'company', '#corporation')).toBe('#corporation');
  });

  test('renames child tag #corp/sub when renaming #corp', () => {
    expect(applyTagRenameToMarkdown('corp', 'company', '#corp/sub')).toBe('#company/sub');
  });

  test('renames both parent and child in same string', () => {
    const result = applyTagRenameToMarkdown('corp', 'company', '#corp and #corp/sub');
    expect(result).toBe('#company and #company/sub');
  });

  test('no match returns original string unchanged', () => {
    const md = 'no tags here';
    expect(applyTagRenameToMarkdown('corp', 'company', md)).toBe(md);
  });

  test('handles tag path with slashes (nested rename)', () => {
    expect(applyTagRenameToMarkdown('corp/sub', 'company/sub', '#corp/sub')).toBe('#company/sub');
  });

  test('does not rename partial nested path — #corp/other stays when renaming #corp/sub', () => {
    expect(applyTagRenameToMarkdown('corp/sub', 'company/sub', '#corp/other')).toBe('#corp/other');
  });

  test('handles special regex chars in tag path', () => {
    // tag paths shouldn't have these but the escape logic should be robust
    expect(applyTagRenameToMarkdown('a.b', 'c', '#a.b')).toBe('#c');
  });

  test('tag followed by punctuation is renamed', () => {
    expect(applyTagRenameToMarkdown('corp', 'company', '#corp.')).toBe('#company.');
  });

  test('tag followed by comma is renamed', () => {
    expect(applyTagRenameToMarkdown('corp', 'company', '#corp, other')).toBe('#company, other');
  });

  test('empty markdown returns empty string', () => {
    expect(applyTagRenameToMarkdown('corp', 'company', '')).toBe('');
  });
});
```

**Step 2: Run tests — verify they all pass**

```bash
bun test lib/graph/__tests__/tag-rename.test.ts
```
Expected: 13 tests pass, 0 fail.

If any fail, fix `applyTagRenameToMarkdown` in `lib/graph/tag-rename.ts` until all pass.

**Step 3: Commit**

```bash
git add lib/graph/__tests__/tag-rename.test.ts
git commit -m "test: applyTagRenameToMarkdown — boundary, nested, edge cases"
```

---

## Task 4: Tests for `collectChangedBlocks`

**Files:**
- Modify: `lib/graph/__tests__/tag-rename.test.ts`

**Step 1: Add import and test suite (append to existing file)**

```typescript
import { collectChangedBlocks } from '../tag-rename';
import type { CraftBlock } from '../types';

describe('collectChangedBlocks', () => {
  function block(id: string, markdown: string, content?: CraftBlock[]): CraftBlock {
    return { id, type: 'text', markdown, content };
  }

  test('returns empty array when no blocks match', () => {
    const blocks = [block('1', 'no tags here')];
    expect(collectChangedBlocks(blocks, 'corp', 'company')).toEqual([]);
  });

  test('returns changed block with updated markdown', () => {
    const blocks = [block('1', '#corp tagged')];
    expect(collectChangedBlocks(blocks, 'corp', 'company')).toEqual([
      { id: '1', markdown: '#company tagged' },
    ]);
  });

  test('skips blocks where tag does not appear', () => {
    const blocks = [block('1', '#other'), block('2', '#corp')];
    const result = collectChangedBlocks(blocks, 'corp', 'company');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  test('recurses into nested content blocks', () => {
    const child = block('child', '#corp in child');
    const parent = block('parent', 'no tag', [child]);
    const result = collectChangedBlocks([parent], 'corp', 'company');
    expect(result).toEqual([{ id: 'child', markdown: '#company in child' }]);
  });

  test('collects changes from both parent and child', () => {
    const child = block('child', '#corp');
    const parent = block('parent', '#corp', [child]);
    const result = collectChangedBlocks([parent], 'corp', 'company');
    expect(result).toHaveLength(2);
    expect(result.map(b => b.id).sort()).toEqual(['child', 'parent']);
  });

  test('blocks without markdown field are skipped', () => {
    const blocks: CraftBlock[] = [{ id: '1', type: 'image' }];
    expect(collectChangedBlocks(blocks, 'corp', 'company')).toEqual([]);
  });
});
```

**Step 2: Run tests**

```bash
bun test lib/graph/__tests__/tag-rename.test.ts
```
Expected: all pass.

**Step 3: Commit**

```bash
git add lib/graph/__tests__/tag-rename.test.ts
git commit -m "test: collectChangedBlocks — nesting, skipping, multi-block"
```

---

## Task 5: Tests for `computeTagRenameMap` and `computeTagRename`

**Files:**
- Modify: `lib/graph/__tests__/tag-rename.test.ts`

**Step 1: Add imports and suites**

```typescript
import { computeTagRenameMap, computeTagRename } from '../tag-rename';
import type { GraphData } from '../types';

function makeGraphData(tagPaths: string[], tagDocLinks: Record<string, string[]>): GraphData {
  const nodes = tagPaths.map(path => ({
    id: `tag:${path}`,
    title: `#${path}`,
    type: 'tag' as const,
    linkCount: 0,
    metadata: { tagPath: path },
  }));

  const links = Object.entries(tagDocLinks).flatMap(([tagPath, docIds]) =>
    docIds.map(docId => ({ source: `tag:${tagPath}`, target: docId }))
  );

  return { nodes, links };
}

describe('computeTagRenameMap', () => {
  test('renames exact tag', () => {
    const graphData = makeGraphData(['corp'], {});
    const map = computeTagRenameMap('corp', 'company', graphData);
    expect(map.get('corp')).toBe('company');
  });

  test('renames nested child tags', () => {
    const graphData = makeGraphData(['corp', 'corp/sub', 'corp/sub/deep'], {});
    const map = computeTagRenameMap('corp', 'company', graphData);
    expect(map.get('corp')).toBe('company');
    expect(map.get('corp/sub')).toBe('company/sub');
    expect(map.get('corp/sub/deep')).toBe('company/sub/deep');
  });

  test('does not rename unrelated tags', () => {
    const graphData = makeGraphData(['corp', 'other', 'corporation'], {});
    const map = computeTagRenameMap('corp', 'company', graphData);
    expect(map.has('other')).toBe(false);
    expect(map.has('corporation')).toBe(false);
  });

  test('includes tag in map even if not present in graph', () => {
    const graphData = makeGraphData([], {});
    const map = computeTagRenameMap('corp', 'company', graphData);
    expect(map.get('corp')).toBe('company');
  });
});

describe('computeTagRename', () => {
  test('returns affected document IDs from graph links', () => {
    const graphData = makeGraphData(['corp'], { corp: ['doc1', 'doc2'] });
    const result = computeTagRename('corp', 'company', graphData);
    expect(result.affectedDocumentIds.sort()).toEqual(['doc1', 'doc2']);
  });

  test('includes docs from child tag links', () => {
    const graphData = makeGraphData(['corp', 'corp/sub'], {
      corp: ['doc1'],
      'corp/sub': ['doc2'],
    });
    const result = computeTagRename('corp', 'company', graphData);
    expect(result.affectedDocumentIds.sort()).toEqual(['doc1', 'doc2']);
  });

  test('deduplicates doc that appears in multiple tag links', () => {
    const graphData = makeGraphData(['corp', 'corp/sub'], {
      corp: ['doc1'],
      'corp/sub': ['doc1'],
    });
    const result = computeTagRename('corp', 'company', graphData);
    expect(result.affectedDocumentIds).toEqual(['doc1']);
  });

  test('returns empty array when tag has no links', () => {
    const graphData = makeGraphData(['corp'], {});
    const result = computeTagRename('corp', 'company', graphData);
    expect(result.affectedDocumentIds).toEqual([]);
  });

  test('handles resolved link objects {id: ...} as source', () => {
    const graphData = makeGraphData(['corp'], {});
    // force-graph resolves string IDs to objects during simulation
    graphData.links = [{ source: { id: 'tag:corp' } as any, target: 'doc1' }];
    const result = computeTagRename('corp', 'company', graphData);
    expect(result.affectedDocumentIds).toEqual(['doc1']);
  });
});
```

**Step 2: Run tests**

```bash
bun test lib/graph/__tests__/tag-rename.test.ts
```
Expected: all pass.

**Step 3: Commit**

```bash
git add lib/graph/__tests__/tag-rename.test.ts
git commit -m "test: computeTagRenameMap and computeTagRename — graph traversal, nesting, dedup"
```

---

## Task 6: Tests for `extractHashtags` and `extractTagsFromBlock`

**Files:**
- Modify: `lib/graph/__tests__/parser.test.ts`

**Step 1: Replace smoke test with full suite**

```typescript
import { describe, expect, test } from 'bun:test';
import { extractHashtags, extractTagsFromBlock, extractBlockLinks, extractLinksFromBlock } from '../parser';
import type { CraftBlock } from '../types';

describe('extractHashtags', () => {
  test('extracts simple tag', () => {
    expect(extractHashtags('#hello')).toContain('hello');
  });

  test('extracts nested tag and auto-creates parents', () => {
    const tags = extractHashtags('#project/work/task');
    expect(tags).toContain('project/work/task');
    expect(tags).toContain('project/work');
    expect(tags).toContain('project');
  });

  test('deduplicates tags', () => {
    const tags = extractHashtags('#tag #tag #tag');
    expect(tags.filter(t => t === 'tag')).toHaveLength(1);
  });

  test('extracts multiple different tags', () => {
    const tags = extractHashtags('#alpha #beta');
    expect(tags).toContain('alpha');
    expect(tags).toContain('beta');
  });

  test('ignores text without #', () => {
    expect(extractHashtags('no tags here')).toEqual([]);
  });

  test('does not extract tags with invalid chars', () => {
    // spaces break tag parsing — "hello world" after # is just "hello"
    const tags = extractHashtags('#hello world');
    expect(tags).toContain('hello');
    expect(tags).not.toContain('hello world');
  });

  test('empty string returns empty array', () => {
    expect(extractHashtags('')).toEqual([]);
  });
});

describe('extractTagsFromBlock', () => {
  function block(id: string, markdown?: string, content?: CraftBlock[]): CraftBlock {
    return { id, type: 'text', markdown, content };
  }

  test('extracts tags from markdown', () => {
    const b = block('1', '#corp tagged');
    expect(extractTagsFromBlock(b)).toContain('corp');
  });

  test('recurses into nested content', () => {
    const child = block('child', '#nested');
    const parent = block('parent', undefined, [child]);
    expect(extractTagsFromBlock(parent)).toContain('nested');
  });

  test('returns empty for block with no markdown', () => {
    expect(extractTagsFromBlock(block('1'))).toEqual([]);
  });
});
```

**Step 2: Run tests**

```bash
bun test lib/graph/__tests__/parser.test.ts
```
Expected: all pass.

**Step 3: Commit**

```bash
git add lib/graph/__tests__/parser.test.ts
git commit -m "test: extractHashtags and extractTagsFromBlock — tags, nesting, dedup"
```

---

## Task 7: Tests for `extractBlockLinks` and `extractLinksFromBlock`

**Files:**
- Modify: `lib/graph/__tests__/parser.test.ts`

**Step 1: Append to existing file**

```typescript
describe('extractBlockLinks', () => {
  test('extracts block:// link ID', () => {
    expect(extractBlockLinks('[text](block://abc123)')).toEqual(['abc123']);
  });

  test('extracts multiple links', () => {
    const links = extractBlockLinks('[a](block://id1) [b](block://id2)');
    expect(links).toEqual(['id1', 'id2']);
  });

  test('returns empty for no block links', () => {
    expect(extractBlockLinks('no links here')).toEqual([]);
  });

  test('ignores non-block:// links', () => {
    expect(extractBlockLinks('[text](https://example.com)')).toEqual([]);
  });
});

describe('extractLinksFromBlock', () => {
  function block(id: string, markdown?: string, content?: CraftBlock[]): CraftBlock {
    return { id, type: 'text', markdown, content };
  }

  test('extracts links from markdown', () => {
    const b = block('1', '[ref](block://target)');
    expect(extractLinksFromBlock(b)).toContain('target');
  });

  test('recurses into nested content', () => {
    const child = block('child', '[ref](block://deep)');
    const parent = block('parent', undefined, [child]);
    expect(extractLinksFromBlock(parent)).toContain('deep');
  });

  test('returns empty when no links', () => {
    expect(extractLinksFromBlock(block('1', 'plain text'))).toEqual([]);
  });
});
```

**Step 2: Run all tests**

```bash
bun test
```
Expected: all tests pass across both files.

**Step 3: Commit**

```bash
git add lib/graph/__tests__/parser.test.ts
git commit -m "test: extractBlockLinks and extractLinksFromBlock"
```

---

## Task 8: Add `test` script and verify full run

**Files:**
- Modify: `package.json` (already done in Task 2 — verify it's there)

**Step 1: Run full suite one final time**

```bash
bun test
```
Expected: all tests pass, clear summary printed.

**Step 2: Verify `bun run test` also works (used by CI)**

```bash
bun run test
```
Expected: same result.

**Step 3: Final commit if anything was missed**

```bash
git status
# if clean, nothing to do
```

---

## Scope Boundary

**In scope:** `applyTagRenameToMarkdown`, `collectChangedBlocks`, `computeTagRenameMap`, `computeTagRename`, `extractHashtags`, `extractTagsFromBlock`, `extractBlockLinks`, `extractLinksFromBlock`

**Out of scope (this plan):** `fetcher.ts`, `cache.ts`, `buildGraphData`, `rebuildNodeRelationships`, React components — these require fetch mocking or browser APIs and are candidates for a follow-up plan after we assess how well this narrow approach worked.
