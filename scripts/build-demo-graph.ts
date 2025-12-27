/**
 * Script to fetch demo graph data from Craft API and save as static JSON
 * Run with: bun scripts/build-demo-graph.ts
 */

const API_URL = process.env.API_URL;
const API_KEY = process.env.API_KEY;

interface CraftDocument {
  id: string;
  title: string;
  lastModifiedAt?: string;
  createdAt?: string;
  clickableLink?: string;
  deleted?: boolean;
}

interface CraftFolder {
  id: string;
  name: string;
  documentCount: number;
  folders?: CraftFolder[];
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
  type: 'document' | 'block' | 'tag' | 'folder';
  linkCount: number;
  color?: string;
  linksTo?: string[];
  linkedFrom?: string[];
  clickableLink?: string;
  createdAt?: string;
  lastModifiedAt?: string;
  nodeSize?: number;
  metadata?: {
    tagPath?: string;
    isNestedTag?: boolean;
    folderPath?: string;
  };
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
const HASHTAG_REGEX = /#([a-zA-Z0-9_]+(?:\/[a-zA-Z0-9_]+)*)/g;

function extractBlockLinks(markdown: string): string[] {
  const links: string[] = [];
  let match;
  BLOCK_LINK_REGEX.lastIndex = 0;
  while ((match = BLOCK_LINK_REGEX.exec(markdown)) !== null) {
    links.push(match[2]);
  }
  return links;
}

function extractHashtags(markdown: string): string[] {
  const tags: string[] = [];
  let match;
  HASHTAG_REGEX.lastIndex = 0;
  while ((match = HASHTAG_REGEX.exec(markdown)) !== null) {
    const fullTag = match[1]; // e.g., "project/work"
    tags.push(fullTag);

    // For nested tags, also create parent tags
    if (fullTag.includes('/')) {
      const parts = fullTag.split('/');
      for (let i = 1; i < parts.length; i++) {
        const parentTag = parts.slice(0, i).join('/');
        if (!tags.includes(parentTag)) {
          tags.push(parentTag);
        }
      }
    }
  }
  return [...new Set(tags)];
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

function extractTagsFromBlock(block: CraftBlock): string[] {
  const tags: string[] = [];
  if (block.markdown) {
    tags.push(...extractHashtags(block.markdown));
  }
  if (block.content) {
    for (const child of block.content) {
      tags.push(...extractTagsFromBlock(child));
    }
  }
  return [...new Set(tags)];
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

async function fetchFolders(): Promise<CraftFolder[]> {
  try {
    console.log('Fetching folders...');
    const response = await fetchAPI<any>('/folders');
    const folders = response.items || [];
    console.log(`Found ${folders.length} top-level folders`);
    return folders;
  } catch (error) {
    console.warn('Failed to fetch folders:', error);
    return [];
  }
}

async function buildDocumentToFolderMap(folders: CraftFolder[]): Promise<Map<string, string>> {
  const docToFolder = new Map<string, string>();

  // Flatten folder hierarchy
  const allFolders: CraftFolder[] = [];
  const flattenFolders = (folders: CraftFolder[]) => {
    for (const folder of folders) {
      allFolders.push(folder);
      if (folder.folders && folder.folders.length > 0) {
        flattenFolders(folder.folders);
      }
    }
  };
  flattenFolders(folders);

  console.log(`Fetching documents for ${allFolders.length} folders...`);

  // Fetch documents for each folder
  for (const folder of allFolders) {
    try {
      const response = await fetchAPI<any>('/documents', {
        folderId: folder.id,
        fetchMetadata: 'true'
      });
      const docs = response.items || response.documents || [];
      for (const doc of docs) {
        docToFolder.set(doc.id, folder.id);
      }
    } catch (error) {
      console.warn(`Failed to fetch documents for folder ${folder.id}:`, error);
    }
  }

  console.log(`Mapped ${docToFolder.size} documents to folders`);
  return docToFolder;
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

  // Fetch folders and build document-to-folder map
  const folders = await fetchFolders();
  const docToFolderMap = folders.length > 0 ? await buildDocumentToFolderMap(folders) : new Map();

  const nodesMap = new Map<string, GraphNode>();
  const blockToDocMap = new Map<string, string>();
  const linksMap = new Map<string, Set<string>>();
  const tagToDocumentsMap = new Map<string, Set<string>>();
  
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
  
  // Fetch blocks and extract links and tags
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

      // Extract tags
      const docTags = new Set<string>();
      for (const block of blocks) {
        const tags = extractTagsFromBlock(block);
        tags.forEach(tag => docTags.add(tag));
      }

      // Map tags to documents
      docTags.forEach(tag => {
        if (!tagToDocumentsMap.has(tag)) {
          tagToDocumentsMap.set(tag, new Set());
        }
        tagToDocumentsMap.get(tag)!.add(doc.id);
      });

      processed++;
      if (processed % 10 === 0) {
        console.log(`Processed ${processed}/${excludeDeleted.length} documents...`);
      }
    } catch (error) {
      console.warn(`Failed to fetch blocks for document ${doc.id}:`, error);
    }
  }
  
  console.log(`Finished processing ${processed} documents`);

  // Create tag nodes (star topology)
  console.log(`\nCreating tag nodes for ${tagToDocumentsMap.size} unique tags...`);
  for (const [tagPath, documentIds] of tagToDocumentsMap.entries()) {
    const tagId = `tag:${tagPath}`;

    nodesMap.set(tagId, {
      id: tagId,
      title: `#${tagPath}`,
      type: 'tag',
      linkCount: 0,
      color: '#34d399', // Green
      nodeSize: 2,
      metadata: {
        tagPath,
        isNestedTag: tagPath.includes('/'),
      },
    });

    // Create links from tag to all documents
    if (!linksMap.has(tagId)) {
      linksMap.set(tagId, new Set());
    }
    for (const docId of documentIds) {
      linksMap.get(tagId)!.add(docId);
    }
  }

  // Create folder nodes (star topology)
  console.log(`Creating folder nodes...`);
  const allFolders: Array<CraftFolder & { fullPath: string }> = [];
  const flattenFolders = (folders: CraftFolder[], parentPath = '') => {
    for (const folder of folders) {
      const fullPath = parentPath ? `${parentPath}/${folder.name}` : folder.name;
      allFolders.push({ ...folder, fullPath });
      if (folder.folders && folder.folders.length > 0) {
        flattenFolders(folder.folders, fullPath);
      }
    }
  };
  flattenFolders(folders);

  for (const folder of allFolders) {
    const docsInFolder = Array.from(docToFolderMap.entries())
      .filter(([_, fid]) => fid === folder.id)
      .map(([docId, _]) => docId);

    if (docsInFolder.length === 0) continue;

    const folderId = `folder:${folder.id}`;

    nodesMap.set(folderId, {
      id: folderId,
      title: folder.fullPath,
      type: 'folder',
      linkCount: 0,
      color: '#60a5fa', // Blue
      nodeSize: 2,
      metadata: {
        folderPath: folder.fullPath,
      },
    });

    // Create links from folder to documents
    if (!linksMap.has(folderId)) {
      linksMap.set(folderId, new Set());
    }
    for (const docId of docsInFolder) {
      if (nodesMap.has(docId)) {
        linksMap.get(folderId)!.add(docId);
      }
    }
  }

  console.log(`Created ${allFolders.filter(f => linksMap.has(`folder:${f.id}`)).length} folder nodes`);

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
  
  // Apply colors (preserve existing colors for tags/folders)
  for (const node of nodesMap.values()) {
    if (!node.color) {
      node.color = calculateNodeColor(node.linkCount);
    }
  }
  
  const graphData: GraphData = {
    nodes: Array.from(nodesMap.values()),
    links,
  };
  
  console.log(`\nGraph built:`);
  console.log(`- ${graphData.nodes.length} total nodes`);
  console.log(`  - ${graphData.nodes.filter(n => n.type === 'document').length} document nodes`);
  console.log(`  - ${graphData.nodes.filter(n => n.type === 'tag').length} tag nodes`);
  console.log(`  - ${graphData.nodes.filter(n => n.type === 'folder').length} folder nodes`);
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

