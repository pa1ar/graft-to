import { describe, expect, test } from 'bun:test';
import {
  buildAdjacencyIndex,
  isNodeConnected,
  isLinkHighlighted,
  hexToRgba,
  filterGraphData,
} from '../interaction';
import type { GraphNode, GraphLink, GraphData } from '../types';

// --- helpers ---

function node(id: string, type: GraphNode['type'] = 'document'): GraphNode {
  return { id, title: id, type, linkCount: 0 };
}

function link(source: string, target: string): GraphLink {
  return { source, target };
}

// d3 mutates link.source/target to objects — simulate that
function d3Link(source: string, target: string) {
  return { source: { id: source }, target: { id: target } } as any as GraphLink;
}

// --- buildAdjacencyIndex ---

describe('buildAdjacencyIndex', () => {
  test('empty links produce empty index', () => {
    const idx = buildAdjacencyIndex([]);
    expect(idx.size).toBe(0);
  });

  test('single link creates bidirectional entries', () => {
    const idx = buildAdjacencyIndex([link('a', 'b')]);
    expect(idx.get('a')?.has('b')).toBe(true);
    expect(idx.get('b')?.has('a')).toBe(true);
  });

  test('multiple links build correct adjacency', () => {
    const idx = buildAdjacencyIndex([
      link('a', 'b'),
      link('a', 'c'),
      link('b', 'c'),
    ]);
    expect(idx.get('a')?.size).toBe(2); // b, c
    expect(idx.get('b')?.size).toBe(2); // a, c
    expect(idx.get('c')?.size).toBe(2); // a, b
  });

  test('handles d3-mutated object links', () => {
    const idx = buildAdjacencyIndex([d3Link('x', 'y')]);
    expect(idx.get('x')?.has('y')).toBe(true);
    expect(idx.get('y')?.has('x')).toBe(true);
  });

  test('duplicate links do not create duplicate entries', () => {
    const idx = buildAdjacencyIndex([link('a', 'b'), link('a', 'b')]);
    expect(idx.get('a')?.size).toBe(1);
    expect(idx.get('b')?.size).toBe(1);
  });

  test('self-link', () => {
    const idx = buildAdjacencyIndex([link('a', 'a')]);
    expect(idx.get('a')?.has('a')).toBe(true);
    expect(idx.get('a')?.size).toBe(1);
  });

  test('star topology (tag connected to many docs)', () => {
    const links = ['d1', 'd2', 'd3', 'd4'].map(d => link('tag:hub', d));
    const idx = buildAdjacencyIndex(links);
    expect(idx.get('tag:hub')?.size).toBe(4);
    for (const d of ['d1', 'd2', 'd3', 'd4']) {
      expect(idx.get(d)?.has('tag:hub')).toBe(true);
      expect(idx.get(d)?.size).toBe(1);
    }
  });
});

// --- isNodeConnected ---

describe('isNodeConnected', () => {
  const idx = buildAdjacencyIndex([
    link('a', 'b'),
    link('a', 'c'),
    link('d', 'e'),
  ]);

  test('returns true when no active node', () => {
    expect(isNodeConnected('a', null, idx)).toBe(true);
    expect(isNodeConnected('z', null, idx)).toBe(true);
  });

  test('active node is always connected to itself', () => {
    expect(isNodeConnected('a', 'a', idx)).toBe(true);
  });

  test('direct neighbor is connected', () => {
    expect(isNodeConnected('b', 'a', idx)).toBe(true);
    expect(isNodeConnected('c', 'a', idx)).toBe(true);
  });

  test('non-neighbor is not connected', () => {
    expect(isNodeConnected('d', 'a', idx)).toBe(false);
    expect(isNodeConnected('e', 'a', idx)).toBe(false);
  });

  test('node not in index is not connected', () => {
    expect(isNodeConnected('unknown', 'a', idx)).toBe(false);
  });

  test('active node not in index — only self matches', () => {
    expect(isNodeConnected('z', 'z', idx)).toBe(true);
    expect(isNodeConnected('a', 'z', idx)).toBe(false);
  });
});

// --- isLinkHighlighted ---

describe('isLinkHighlighted', () => {
  test('all links highlighted when no active node', () => {
    expect(isLinkHighlighted(link('a', 'b'), null)).toBe(true);
  });

  test('link touching active node is highlighted', () => {
    expect(isLinkHighlighted(link('a', 'b'), 'a')).toBe(true);
    expect(isLinkHighlighted(link('a', 'b'), 'b')).toBe(true);
  });

  test('link not touching active node is not highlighted', () => {
    expect(isLinkHighlighted(link('a', 'b'), 'c')).toBe(false);
  });

  test('handles d3-mutated object links', () => {
    expect(isLinkHighlighted(d3Link('x', 'y'), 'x')).toBe(true);
    expect(isLinkHighlighted(d3Link('x', 'y'), 'z')).toBe(false);
  });
});

// --- hexToRgba ---

describe('hexToRgba', () => {
  test('converts white', () => {
    expect(hexToRgba('#ffffff', 1)).toBe('rgba(255, 255, 255, 1)');
  });

  test('converts black', () => {
    expect(hexToRgba('#000000', 0.5)).toBe('rgba(0, 0, 0, 0.5)');
  });

  test('converts arbitrary color', () => {
    expect(hexToRgba('#34d399', 0.8)).toBe('rgba(52, 211, 153, 0.8)');
  });

  test('alpha 0', () => {
    expect(hexToRgba('#ff0000', 0)).toBe('rgba(255, 0, 0, 0)');
  });
});

// --- filterGraphData ---

describe('filterGraphData', () => {
  const docs = [node('d1'), node('d2'), node('d3')];
  const tags = [
    { ...node('tag:foo', 'tag'), color: '#34d399' },
    { ...node('tag:bar', 'tag'), color: '#34d399' },
  ];
  const folders = [
    { ...node('folder:f1', 'folder'), color: '#60a5fa' },
  ];

  const allNodes = [...docs, ...tags, ...folders];
  const allLinks: GraphLink[] = [
    link('d1', 'd2'),           // wikilink
    link('d2', 'd3'),           // wikilink
    link('tag:foo', 'd1'),      // tag link
    link('tag:bar', 'd2'),      // tag link
    link('folder:f1', 'd1'),    // folder link
    link('folder:f1', 'd3'),    // folder link
  ];

  const graph: GraphData = { nodes: allNodes, links: allLinks };

  test('show everything', () => {
    const result = filterGraphData(graph, { showWikilinks: true, showTags: true, showFolders: true });
    expect(result.nodes).toHaveLength(6);
    expect(result.links).toHaveLength(6);
  });

  test('hide tags removes tag nodes and their links', () => {
    const result = filterGraphData(graph, { showWikilinks: true, showTags: false, showFolders: true });
    expect(result.nodes.filter(n => n.type === 'tag')).toHaveLength(0);
    // tag links removed because tag nodes are gone
    expect(result.links).toHaveLength(4); // 2 wikilinks + 2 folder links
  });

  test('hide folders removes folder nodes and their links', () => {
    const result = filterGraphData(graph, { showWikilinks: true, showTags: true, showFolders: false });
    expect(result.nodes.filter(n => n.type === 'folder')).toHaveLength(0);
    expect(result.links).toHaveLength(4); // 2 wikilinks + 2 tag links
  });

  test('hide wikilinks removes doc-to-doc links but keeps tag/folder links', () => {
    const result = filterGraphData(graph, { showWikilinks: false, showTags: true, showFolders: true });
    expect(result.nodes).toHaveLength(6); // all nodes still visible
    expect(result.links).toHaveLength(4); // 2 tag + 2 folder (no wikilinks)
  });

  test('hide everything except docs leaves only orphan docs', () => {
    const result = filterGraphData(graph, { showWikilinks: false, showTags: false, showFolders: false });
    expect(result.nodes).toHaveLength(3); // only docs
    expect(result.links).toHaveLength(0); // no links (wikilinks off, tags/folders gone)
  });

  test('documents are always included', () => {
    const result = filterGraphData(graph, { showWikilinks: false, showTags: false, showFolders: false });
    for (const d of docs) {
      expect(result.nodes.some(n => n.id === d.id)).toBe(true);
    }
  });

  test('handles d3-mutated links in filter', () => {
    const mutatedGraph: GraphData = {
      nodes: [node('a'), node('b')],
      links: [d3Link('a', 'b')],
    };
    const result = filterGraphData(mutatedGraph, { showWikilinks: true, showTags: false, showFolders: false });
    expect(result.links).toHaveLength(1);
  });

  test('link with missing node is filtered out', () => {
    const sparse: GraphData = {
      nodes: [node('a')],
      links: [link('a', 'missing')],
    };
    const result = filterGraphData(sparse, { showWikilinks: true, showTags: false, showFolders: false });
    expect(result.links).toHaveLength(0);
  });
});
