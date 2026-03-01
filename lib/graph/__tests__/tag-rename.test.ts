import { describe, expect, test } from 'bun:test';
import {
  applyTagRenameToMarkdown,
  collectChangedBlocks,
  computeTagRenameMap,
  computeTagRename,
  patchGraphDataForTagRename,
  isBlockMarkdownSafeForPut,
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

describe('isBlockMarkdownSafeForPut', () => {
  test('plain text is safe', () => {
    expect(isBlockMarkdownSafeForPut('hello world #tag')).toBe(true);
  });

  test('single newline is safe', () => {
    expect(isBlockMarkdownSafeForPut('line one\nline two')).toBe(true);
  });

  test('HTML opening tag is unsafe', () => {
    expect(isBlockMarkdownSafeForPut('text <span>styled</span> more')).toBe(false);
  });

  test('HTML closing tag is unsafe', () => {
    expect(isBlockMarkdownSafeForPut('text </span> more')).toBe(false);
  });

  test('self-closing HTML tag is unsafe', () => {
    expect(isBlockMarkdownSafeForPut('text <br/> more')).toBe(false);
  });

  test('multi-block content (double newline) is unsafe', () => {
    expect(isBlockMarkdownSafeForPut('paragraph one\n\nparagraph two')).toBe(false);
  });

  test('angle brackets in non-HTML context are safe', () => {
    expect(isBlockMarkdownSafeForPut('5 < 10 and 10 > 5')).toBe(true);
  });

  test('markdown links are safe', () => {
    expect(isBlockMarkdownSafeForPut('[link](https://example.com)')).toBe(true);
  });

  test('empty string is safe', () => {
    expect(isBlockMarkdownSafeForPut('')).toBe(true);
  });

  test('Windows line endings (CRLF double) is unsafe', () => {
    expect(isBlockMarkdownSafeForPut('para one\r\n\r\npara two')).toBe(false);
  });

  test('newline followed by heading is unsafe', () => {
    expect(isBlockMarkdownSafeForPut('text\n# heading')).toBe(false);
  });

  test('newline followed by unordered list item is unsafe', () => {
    expect(isBlockMarkdownSafeForPut('text\n- item')).toBe(false);
    expect(isBlockMarkdownSafeForPut('text\n* item')).toBe(false);
    expect(isBlockMarkdownSafeForPut('text\n+ item')).toBe(false);
  });

  test('newline followed by ordered list item is unsafe', () => {
    expect(isBlockMarkdownSafeForPut('text\n1. item')).toBe(false);
  });

  test('newline followed by blockquote is unsafe', () => {
    expect(isBlockMarkdownSafeForPut('text\n> quote')).toBe(false);
  });

  test('newline followed by code fence is unsafe', () => {
    expect(isBlockMarkdownSafeForPut('text\n```code```')).toBe(false);
  });

  test('newline followed by horizontal rule is unsafe', () => {
    expect(isBlockMarkdownSafeForPut('text\n---')).toBe(false);
    expect(isBlockMarkdownSafeForPut('text\n___')).toBe(false);
    expect(isBlockMarkdownSafeForPut('text\n***')).toBe(false);
  });

  test('inline list marker without preceding newline is safe', () => {
    expect(isBlockMarkdownSafeForPut('use - for lists')).toBe(true);
  });

  test('inline hash without preceding newline is safe', () => {
    expect(isBlockMarkdownSafeForPut('#tag at start')).toBe(true);
  });
});

describe('collectChangedBlocks', () => {
  function block(id: string, markdown: string, content?: CraftBlock[]): CraftBlock {
    return { id, type: 'text', markdown, content };
  }

  test('returns empty changed/skipped when no blocks match', () => {
    const blocks = [block('1', 'no tags here')];
    const result = collectChangedBlocks(blocks, 'corp', 'company');
    expect(result.changed).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  test('returns changed block with updated markdown', () => {
    const blocks = [block('1', '#corp tagged')];
    const result = collectChangedBlocks(blocks, 'corp', 'company');
    expect(result.changed).toEqual([
      { id: '1', markdown: '#company tagged' },
    ]);
    expect(result.skipped).toEqual([]);
  });

  test('skips blocks where tag does not appear', () => {
    const blocks = [block('1', '#other'), block('2', '#corp')];
    const result = collectChangedBlocks(blocks, 'corp', 'company');
    expect(result.changed).toHaveLength(1);
    expect(result.changed[0].id).toBe('2');
  });

  test('recurses into nested content blocks', () => {
    const child = block('child', '#corp in child');
    const parent = block('parent', 'no tag', [child]);
    const result = collectChangedBlocks([parent], 'corp', 'company');
    expect(result.changed).toEqual([{ id: 'child', markdown: '#company in child' }]);
  });

  test('collects changes from both parent and child', () => {
    const child = block('child', '#corp');
    const parent = block('parent', '#corp', [child]);
    const result = collectChangedBlocks([parent], 'corp', 'company');
    expect(result.changed).toHaveLength(2);
    expect(result.changed.map(b => b.id).sort()).toEqual(['child', 'parent']);
  });

  test('blocks without markdown field are skipped', () => {
    const blocks: CraftBlock[] = [{ id: '1', type: 'image' }];
    const result = collectChangedBlocks(blocks, 'corp', 'company');
    expect(result.changed).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  test('skips blocks with HTML tags in markdown', () => {
    const blocks = [block('1', '<span>#corp</span> text')];
    const result = collectChangedBlocks(blocks, 'corp', 'company');
    expect(result.changed).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].id).toBe('1');
    expect(result.skipped[0].reason).toBe('contains HTML');
  });

  test('skips blocks with multi-block content', () => {
    const blocks = [block('1', '#corp\n\nmore text')];
    const result = collectChangedBlocks(blocks, 'corp', 'company');
    expect(result.changed).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe('multi-block content');
  });

  test('separates safe and unsafe blocks in same tree', () => {
    const safe = block('safe', '#corp plain');
    const unsafe = block('unsafe', '<b>#corp</b>');
    const result = collectChangedBlocks([safe, unsafe], 'corp', 'company');
    expect(result.changed).toHaveLength(1);
    expect(result.changed[0].id).toBe('safe');
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].id).toBe('unsafe');
  });

  test('no-match blocks are neither changed nor skipped', () => {
    const noMatch = block('1', 'no tags');
    const htmlNoMatch = block('2', '<span>no tags</span>');
    const result = collectChangedBlocks([noMatch, htmlNoMatch], 'corp', 'company');
    expect(result.changed).toEqual([]);
    expect(result.skipped).toEqual([]);
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

// helper that includes document nodes for patchGraphDataForTagRename tests
function makeFullGraphData(
  tagPaths: string[],
  docIds: string[],
  tagDocLinks: Record<string, string[]>
): GraphData {
  const tagNodes = tagPaths.map(path => ({
    id: `tag:${path}`,
    title: `#${path}`,
    type: 'tag' as const,
    linkCount: 0,
    color: '#34d399',
    metadata: { tagPath: path, isNestedTag: path.includes('/') },
  }));

  const docNodes = docIds.map(id => ({
    id,
    title: `Doc ${id}`,
    type: 'document' as const,
    linkCount: 0,
  }));

  const links = Object.entries(tagDocLinks).flatMap(([tagPath, ids]) =>
    ids.map(docId => ({ source: `tag:${tagPath}`, target: docId }))
  );

  // compute linkCounts
  const linkCounts = new Map<string, number>();
  for (const link of links) {
    linkCounts.set(link.source, (linkCounts.get(link.source) ?? 0) + 1);
    linkCounts.set(link.target, (linkCounts.get(link.target) ?? 0) + 1);
  }

  const nodes = [...tagNodes, ...docNodes].map(n => ({
    ...n,
    linkCount: linkCounts.get(n.id) ?? 0,
  }));

  return { nodes, links };
}

describe('patchGraphDataForTagRename', () => {
  test('renames tag node ID and title', () => {
    const graph = makeFullGraphData(['corp'], ['doc1'], { corp: ['doc1'] });
    const renameMap = new Map([['corp', 'company']]);
    const result = patchGraphDataForTagRename(graph, renameMap);

    expect(result).not.toBeNull();
    const tagNode = result!.nodes.find(n => n.id === 'tag:company');
    expect(tagNode).toBeDefined();
    expect(tagNode!.title).toBe('#company');
    expect(tagNode!.metadata?.tagPath).toBe('company');
    // old ID should be gone
    expect(result!.nodes.find(n => n.id === 'tag:corp')).toBeUndefined();
  });

  test('updates links to reference new tag ID', () => {
    const graph = makeFullGraphData(['corp'], ['doc1'], { corp: ['doc1'] });
    const renameMap = new Map([['corp', 'company']]);
    const result = patchGraphDataForTagRename(graph, renameMap)!;

    const link = result.links[0];
    const src = typeof link.source === 'object' ? (link.source as any).id : link.source;
    expect(src).toBe('tag:company');
  });

  test('handles nested tag children', () => {
    const graph = makeFullGraphData(['corp', 'corp/sub'], ['doc1'], {
      corp: ['doc1'],
      'corp/sub': ['doc1'],
    });
    const renameMap = new Map([['corp', 'company'], ['corp/sub', 'company/sub']]);
    const result = patchGraphDataForTagRename(graph, renameMap)!;

    expect(result.nodes.find(n => n.id === 'tag:company')).toBeDefined();
    expect(result.nodes.find(n => n.id === 'tag:company/sub')).toBeDefined();
    const subNode = result.nodes.find(n => n.id === 'tag:company/sub')!;
    expect(subNode.metadata?.tagPath).toBe('company/sub');
    expect(subNode.metadata?.isNestedTag).toBe(true);
  });

  test('returns null on tag collision', () => {
    // 'other' already exists as a tag — renaming 'corp' → 'other' should fail
    const graph = makeFullGraphData(['corp', 'other'], ['doc1'], { corp: ['doc1'], other: ['doc1'] });
    const renameMap = new Map([['corp', 'other']]);
    const result = patchGraphDataForTagRename(graph, renameMap);
    expect(result).toBeNull();
  });

  test('preserves document nodes unchanged', () => {
    const graph = makeFullGraphData(['corp'], ['doc1', 'doc2'], { corp: ['doc1'] });
    const renameMap = new Map([['corp', 'company']]);
    const result = patchGraphDataForTagRename(graph, renameMap)!;

    const doc1 = result.nodes.find(n => n.id === 'doc1');
    const doc2 = result.nodes.find(n => n.id === 'doc2');
    expect(doc1).toBeDefined();
    expect(doc1!.title).toBe('Doc doc1');
    expect(doc2).toBeDefined();
    expect(doc2!.title).toBe('Doc doc2');
  });

  test('recalculates linkCounts', () => {
    const graph = makeFullGraphData(['corp'], ['doc1', 'doc2'], { corp: ['doc1', 'doc2'] });
    const renameMap = new Map([['corp', 'company']]);
    const result = patchGraphDataForTagRename(graph, renameMap)!;

    const tagNode = result.nodes.find(n => n.id === 'tag:company')!;
    expect(tagNode.linkCount).toBe(2);

    const doc1 = result.nodes.find(n => n.id === 'doc1')!;
    expect(doc1.linkCount).toBe(1);
  });

  test('updates linkedFrom on document nodes', () => {
    const graph = makeFullGraphData(['corp'], ['doc1'], { corp: ['doc1'] });
    // manually set linkedFrom to simulate real graph state
    const doc1 = graph.nodes.find(n => n.id === 'doc1')!;
    doc1.linkedFrom = ['tag:corp'];

    const renameMap = new Map([['corp', 'company']]);
    const result = patchGraphDataForTagRename(graph, renameMap)!;

    const patchedDoc = result.nodes.find(n => n.id === 'doc1')!;
    expect(patchedDoc.linkedFrom).toEqual(['tag:company']);
  });

  test('returns shallow copy when renameMap is empty', () => {
    const graph = makeFullGraphData(['corp'], ['doc1'], { corp: ['doc1'] });
    const renameMap = new Map<string, string>();
    const result = patchGraphDataForTagRename(graph, renameMap);

    expect(result).not.toBeNull();
    // should be a copy, not same reference
    expect(result).not.toBe(graph);
    // content should be identical
    expect(result!.nodes.length).toBe(graph.nodes.length);
    expect(result!.links.length).toBe(graph.links.length);
  });
});
