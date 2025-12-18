/**
 * Script to fetch demo graph data from Craft API and save as static JSON
 * Run with: bun scripts/build-demo-graph.ts
 */

const API_URL = 'https://connect.craft.do/links/15Lpq8eBV9s/api/v1';
const API_KEY = 'pdk_c3afcd81-def7-6fbc-a784-f31686f5aa5a';

interface CraftDocument {
  id: string;
  title: string;
  lastModifiedAt?: string;
  createdAt?: string;
  clickableLink?: string;
  deleted?: boolean;
}

interface CraftBlock {
  id: string;
  type: string;
  markdown?: string;
  content?: CraftBlock[];
}

interface GraphNode {
  id: string;
  title: string;
  type: 'document' | 'block';
  linkCount: number;
  color?: string;
  linksTo?: string[];
  linkedFrom?: string[];
  clickableLink?: string;
  createdAt?: string;
  lastModifiedAt?: string;
}

interface GraphLink {
  source: string;
  target: string;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

const BLOCK_LINK_REGEX = /\[([^\]]+)\]\(block:\/\/([^)]+)\)/g;

function extractBlockLinks(markdown: string): string[] {
  const links: string[] = [];
  let match;
  BLOCK_LINK_REGEX.lastIndex = 0;
  while ((match = BLOCK_LINK_REGEX.exec(markdown)) !== null) {
    links.push(match[2]);
  }
  return links;
}

function extractLinksFromBlock(block: CraftBlock): string[] {
  const links: string[] = [];
  if (block.markdown) {
    links.push(...extractBlockLinks(block.markdown));
  }
  if (block.content) {
    for (const child of block.content) {
      links.push(...extractLinksFromBlock(child));
    }
  }
  return links;
}

async function fetchAPI<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(API_URL + endpoint);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`);
  }

  return response.json();
}

async function fetchDocuments(): Promise<CraftDocument[]> {
  console.log('Fetching documents...');
  const response = await fetchAPI<any>('/documents', { fetchMetadata: 'true' });
  const docs = response.documents || response.items || response;
  console.log(`Found ${docs.length} documents`);
  return docs;
}

async function fetchBlocks(documentId: string): Promise<CraftBlock[]> {
  const response = await fetchAPI<any>('/blocks', {
    id: documentId,
    maxDepth: '-1',
  });
  
  if (Array.isArray(response)) {
    return response;
  }
  if (response && response.id && response.type) {
    return [response];
  }
  if (response && Array.isArray(response.blocks)) {
    return response.blocks;
  }
  
  return [];
}

function calculateNodeColor(linkCount: number): string {
  if (linkCount === 0) return '#94a3b8';
  if (linkCount <= 2) return '#60a5fa';
  if (linkCount <= 5) return '#34d399';
  if (linkCount <= 10) return '#fbbf24';
  return '#f87171';
}

async function buildDemoGraph(): Promise<GraphData> {
  const documents = await fetchDocuments();
  const excludeDeleted = documents.filter(doc => !doc.deleted);
  
  // Sort by creation date for chronological layout
  excludeDeleted.sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return aTime - bTime;
  });

  console.log(`Processing ${excludeDeleted.length} documents (excluding deleted)...`);
  
  const nodesMap = new Map<string, GraphNode>();
  const blockToDocMap = new Map<string, string>();
  const linksMap = new Map<string, Set<string>>();
  
  // Create document nodes
  for (const doc of excludeDeleted) {
    nodesMap.set(doc.id, {
      id: doc.id,
      title: doc.title || 'Untitled',
      type: 'document',
      linkCount: 0,
      clickableLink: doc.clickableLink,
      createdAt: doc.createdAt,
      lastModifiedAt: doc.lastModifiedAt,
    });
    blockToDocMap.set(doc.id, doc.id);
  }
  
  // Fetch blocks and extract links
  let processed = 0;
  for (const doc of excludeDeleted) {
    try {
      const blocks = await fetchBlocks(doc.id);
      
      // Map blocks to document
      const addBlocksToMap = (blocks: CraftBlock[]) => {
        for (const block of blocks) {
          blockToDocMap.set(block.id, doc.id);
          if (block.content) {
            addBlocksToMap(block.content);
          }
        }
      };
      addBlocksToMap(blocks);
      
      // Extract links
      const docLinks = new Set<string>();
      for (const block of blocks) {
        const links = extractLinksFromBlock(block);
        for (const targetId of links) {
          const targetDocId = blockToDocMap.get(targetId) || targetId;
          if (doc.id !== targetDocId) {
            docLinks.add(targetDocId);
          }
        }
      }
      
      if (docLinks.size > 0) {
        linksMap.set(doc.id, docLinks);
      }
      
      processed++;
      if (processed % 10 === 0) {
        console.log(`Processed ${processed}/${excludeDeleted.length} documents...`);
      }
    } catch (error) {
      console.warn(`Failed to fetch blocks for document ${doc.id}:`, error);
    }
  }
  
  console.log(`Finished processing ${processed} documents`);
  
  // Build links array
  const links: GraphLink[] = [];
  for (const [source, targets] of linksMap.entries()) {
    const sourceNode = nodesMap.get(source);
    if (sourceNode) {
      sourceNode.linksTo = Array.from(targets);
    }
    
    for (const target of targets) {
      if (source !== target && nodesMap.has(target)) {
        links.push({ source, target });
        
        const sourceNode = nodesMap.get(source);
        const targetNode = nodesMap.get(target);
        
        if (sourceNode) sourceNode.linkCount++;
        if (targetNode) {
          targetNode.linkCount++;
          if (!targetNode.linkedFrom) {
            targetNode.linkedFrom = [];
          }
          targetNode.linkedFrom.push(source);
        }
      }
    }
  }
  
  // Apply colors
  for (const node of nodesMap.values()) {
    node.color = calculateNodeColor(node.linkCount);
  }
  
  const graphData: GraphData = {
    nodes: Array.from(nodesMap.values()),
    links,
  };
  
  console.log(`\nGraph built:`);
  console.log(`- ${graphData.nodes.length} nodes`);
  console.log(`- ${graphData.links.length} links`);
  console.log(`- ${graphData.nodes.filter(n => n.linkCount === 0).length} orphan nodes`);
  
  return graphData;
}

async function main() {
  try {
    console.log('Building demo graph data...\n');
    const graphData = await buildDemoGraph();
    
    const outputPath = './public/demo-graph.json';
    await Bun.write(outputPath, JSON.stringify(graphData, null, 2));
    
    console.log(`\nDemo graph saved to ${outputPath}`);
    console.log(`File size: ${((await Bun.file(outputPath).size) / 1024).toFixed(2)} KB`);
  } catch (error) {
    console.error('Failed to build demo graph:', error);
    process.exit(1);
  }
}

main();

