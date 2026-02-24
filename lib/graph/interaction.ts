/**
 * Pure graph interaction logic — extracted for testability and performance.
 * Used by force-graph components for node/link highlighting and filtering.
 */

import type { GraphNode, GraphLink, GraphData } from './types';

// --- adjacency index ---

export type AdjacencyIndex = Map<string, Set<string>>;

/**
 * Build a bidirectional adjacency index from graph links.
 * Returns a Map where each node ID maps to a Set of connected node IDs.
 * Handles both string and object link source/target (d3 mutates these).
 */
export function buildAdjacencyIndex(links: GraphLink[]): AdjacencyIndex {
  const index: AdjacencyIndex = new Map();

  for (const link of links) {
    const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
    const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;

    if (!index.has(sourceId)) index.set(sourceId, new Set());
    if (!index.has(targetId)) index.set(targetId, new Set());

    index.get(sourceId)!.add(targetId);
    index.get(targetId)!.add(sourceId);
  }

  return index;
}

/**
 * Check if a node is connected to the active node using the adjacency index.
 * Returns true if no active node (everything visible), or if connected.
 */
export function isNodeConnected(
  nodeId: string,
  activeNodeId: string | null,
  adjacency: AdjacencyIndex
): boolean {
  if (!activeNodeId) return true;
  if (nodeId === activeNodeId) return true;
  return adjacency.get(activeNodeId)?.has(nodeId) ?? false;
}

/**
 * Check if a link is connected to the active node.
 */
export function isLinkHighlighted(
  link: GraphLink,
  activeNodeId: string | null
): boolean {
  if (!activeNodeId) return true;
  const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
  const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;
  return sourceId === activeNodeId || targetId === activeNodeId;
}

// --- color helpers ---

/**
 * Convert hex color to rgba string.
 */
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// --- graph filtering ---

export interface FilterOptions {
  showWikilinks: boolean;
  showTags: boolean;
  showFolders: boolean;
}

/**
 * Filter graph data based on visibility toggles.
 * Uses a node ID set and a node map for O(1) lookups.
 */
export function filterGraphData(graphData: GraphData, options: FilterOptions): GraphData {
  const { showWikilinks, showTags, showFolders } = options;

  const nodes = graphData.nodes.filter(node => {
    if (node.type === 'tag') return showTags;
    if (node.type === 'folder') return showFolders;
    return true;
  });

  const nodeIds = new Set(nodes.map(n => n.id));

  // build a type lookup map — O(n) once instead of O(n) per link
  const nodeTypeMap = new Map<string, GraphNode['type']>();
  for (const node of graphData.nodes) {
    nodeTypeMap.set(node.id, node.type);
  }

  const links = graphData.links.filter(link => {
    const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
    const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;

    if (!nodeIds.has(sourceId) || !nodeIds.has(targetId)) return false;

    if (!showWikilinks &&
        nodeTypeMap.get(sourceId) === 'document' &&
        nodeTypeMap.get(targetId) === 'document') {
      return false;
    }

    return true;
  });

  return { nodes, links };
}
