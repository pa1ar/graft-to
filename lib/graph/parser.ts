/**
 * Parser for extracting block links from Craft document markdown.
 * Handles block:// link format and builds graph relationships.
 */

import type { CraftBlock, GraphNode, GraphLink, GraphData } from './types';

// Match markdown links with block:// URLs: [text](block://ID)
const BLOCK_LINK_REGEX = /\[([^\]]+)\]\(block:\/\/([^)]+)\)/g;

export function extractBlockLinks(markdown: string): string[] {
  const links: string[] = [];
  let match;
  
  // Reset regex state
  BLOCK_LINK_REGEX.lastIndex = 0;
  
  while ((match = BLOCK_LINK_REGEX.exec(markdown)) !== null) {
    // match[2] contains the block ID
    links.push(match[2]);
  }
  
  return links;
}

export function extractLinksFromBlock(block: CraftBlock): string[] {
  const links: string[] = [];
  
  if (block.markdown) {
    links.push(...extractBlockLinks(block.markdown));
  }
  
  if (block.content) {
    for (const childBlock of block.content) {
      links.push(...extractLinksFromBlock(childBlock));
    }
  }
  
  return links;
}

export function buildGraphData(
  documents: Array<{ id: string; title: string }>,
  blocksMap: Map<string, CraftBlock[]>
): GraphData {
  const nodesMap = new Map<string, GraphNode>();
  const linksMap = new Map<string, Set<string>>();
  
  console.log('Building graph with', documents.length, 'documents');
  
  for (const doc of documents) {
    if (!nodesMap.has(doc.id)) {
      nodesMap.set(doc.id, {
        id: doc.id,
        title: doc.title || 'Untitled',
        type: 'document',
        linkCount: 0,
      });
    }
    
    const blocks = blocksMap.get(doc.id);
    if (!blocks) continue;
    
    for (const block of blocks) {
      const links = extractLinksFromBlock(block);
      
      if (links.length > 0) {
        console.log(`Document "${doc.title}" (${doc.id}) has links:`, links);
        
        if (!linksMap.has(doc.id)) {
          linksMap.set(doc.id, new Set());
        }
        
        for (const targetId of links) {
          linksMap.get(doc.id)!.add(targetId);
          
          // Check if target is a document ID
          const targetDoc = documents.find(d => d.id === targetId);
          if (targetDoc) {
            console.log(`  -> Links to document "${targetDoc.title}"`);
          } else {
            console.log(`  -> Links to unknown block ${targetId}`);
          }
          
          if (!nodesMap.has(targetId)) {
            nodesMap.set(targetId, {
              id: targetId,
              title: targetDoc?.title || `Block ${targetId}`,
              type: targetDoc ? 'document' : 'block',
              linkCount: 0,
            });
          }
        }
      }
    }
  }
  
  const links: GraphLink[] = [];
  
  // Build links and track relationships
  for (const [source, targets] of linksMap.entries()) {
    const sourceNode = nodesMap.get(source);
    if (sourceNode) {
      sourceNode.linksTo = Array.from(targets);
    }
    
    for (const target of targets) {
      if (source !== target) {
        links.push({ source, target });
        
        const sourceNode = nodesMap.get(source);
        const targetNode = nodesMap.get(target);
        
        if (sourceNode) sourceNode.linkCount++;
        if (targetNode) {
          targetNode.linkCount++;
          // Track incoming links
          if (!targetNode.linkedFrom) {
            targetNode.linkedFrom = [];
          }
          targetNode.linkedFrom.push(source);
        }
      }
    }
  }
  
  return {
    nodes: Array.from(nodesMap.values()),
    links,
  };
}

export function calculateNodeColor(linkCount: number): string {
  if (linkCount === 0) return '#94a3b8';
  if (linkCount <= 2) return '#60a5fa';
  if (linkCount <= 5) return '#34d399';
  if (linkCount <= 10) return '#fbbf24';
  return '#f87171';
}

export function getGraphStats(graphData: GraphData) {
  const orphanNodes = graphData.nodes.filter(n => n.linkCount === 0).length;
  
  let mostConnectedNode = null;
  let maxConnections = 0;
  
  for (const node of graphData.nodes) {
    if (node.linkCount > maxConnections) {
      maxConnections = node.linkCount;
      mostConnectedNode = {
        id: node.id,
        title: node.title,
        connections: node.linkCount,
      };
    }
  }
  
  return {
    totalDocuments: graphData.nodes.filter(n => n.type === 'document').length,
    totalNodes: graphData.nodes.length,
    totalLinks: graphData.links.length,
    orphanNodes,
    mostConnectedNode,
  };
}

