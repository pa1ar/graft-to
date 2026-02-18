import { describe, expect, test } from 'bun:test';
import {
  applyTagRenameToMarkdown,
  collectChangedBlocks,
  computeTagRenameMap,
  computeTagRename,
} from '../tag-rename';
import type { CraftBlock, GraphData } from '../types';

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
