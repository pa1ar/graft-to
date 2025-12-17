/**
 * Craft API client for fetching documents and blocks.
 * Browser-only implementation - never sends API keys to server.
 */

import type {
  CraftAPIConfig,
  CraftDocument,
  CraftBlock,
  GraphBuildOptions,
  GraphData,
  GraphBuildStreamingOptions,
  GraphNode,
  GraphLink,
  DocumentMetadata,
  GraphUpdateResult,
} from './types';
import { buildGraphData, calculateNodeColor, extractLinksFromBlock } from './parser';

export class CraftAPIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: any
  ) {
    super(message);
    this.name = 'CraftAPIError';
  }
}

export class CraftGraphFetcher {
  private config: CraftAPIConfig;

  constructor(config: CraftAPIConfig) {
    this.config = config;
  }

  private async fetchAPI<T>(
    endpoint: string,
    params: Record<string, string> = {}
  ): Promise<T> {
    // Use proxy to avoid CORS issues
    const proxyUrl = new URL('/api/craft' + endpoint, window.location.origin);
    
    Object.entries(params).forEach(([key, value]) => {
      proxyUrl.searchParams.append(key, value);
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-craft-url': this.config.baseUrl,
    };

    if (this.config.apiKey) {
      headers['x-craft-key'] = this.config.apiKey;
    }

    const response = await fetch(proxyUrl.toString(), { headers });

    if (!response.ok) {
      const errorText = await response.text();
      throw new CraftAPIError(
        `API request failed: ${response.statusText}`,
        response.status,
        errorText
      );
    }

    return response.json();
  }

  async fetchDocuments(fetchMetadata = false): Promise<CraftDocument[]> {
    // First, get all folders to know where documents can be
    const foldersResponse = await this.fetchAPI<any>('/folders');
    console.log('[DEBUG] Folders response:', JSON.stringify(foldersResponse, null, 2));
    
    const folders = foldersResponse.items || foldersResponse.folders || [];
    console.log(`[DEBUG] Found ${folders.length} top-level folders`);
    
    const allDocuments: CraftDocument[] = [];
    
    // Built-in locations use 'location' parameter
    const builtInLocations = ['unsorted', 'daily_notes', 'templates'];
    
    // Custom folders use 'folderId' parameter
    const customFolderIds: string[] = [];
    
    // Helper function to recursively collect all custom folder IDs
    const collectFolderIds = (folderList: any[], depth = 0): void => {
      for (const folder of folderList) {
        // Skip trash and built-in locations
        if (folder.id === 'trash' || builtInLocations.includes(folder.id)) continue;
        
        console.log(`[DEBUG] ${'  '.repeat(depth)}Custom Folder: ${folder.name} (${folder.id}) - ${folder.documentCount || 0} docs`);
        customFolderIds.push(folder.id);
        
        // Recursively collect nested folder IDs
        if (folder.folders && folder.folders.length > 0) {
          collectFolderIds(folder.folders, depth + 1);
        }
      }
    };
    
    collectFolderIds(folders);
    console.log(`[DEBUG] Custom folders to fetch from: ${customFolderIds.length}`, customFolderIds);
    
    // Fetch from built-in locations using 'location' parameter
    for (const locationId of builtInLocations) {
      try {
        console.log(`[DEBUG] Fetching from built-in location: ${locationId}`);
        const params: Record<string, string> = {
          location: locationId,
        };
        if (fetchMetadata) {
          params.fetchMetadata = 'true';
        }
        const response = await this.fetchAPI<any>('/documents', params);
        
        const docs = response.items || response.documents || response;
        if (Array.isArray(docs)) {
          console.log(`[DEBUG] Location ${locationId}: ${docs.length} documents`);
          allDocuments.push(...docs);
        }
      } catch (error) {
        console.warn(`[DEBUG] Failed to fetch from location ${locationId}:`, error);
      }
    }
    
    // Fetch from custom folders using 'folderId' parameter (singular!)
    for (const folderId of customFolderIds) {
      try {
        console.log(`[DEBUG] Fetching from custom folder: ${folderId}`);
        const params: Record<string, string> = {
          folderId: folderId,  // Note: singular 'folderId', not 'folderIds'
        };
        if (fetchMetadata) {
          params.fetchMetadata = 'true';
        }
        const response = await this.fetchAPI<any>('/documents', params);
        
        console.log(`[DEBUG] Folder ${folderId} response:`, response);
        
        const docs = response.items || response.documents || response;
        if (Array.isArray(docs)) {
          console.log(`[DEBUG] Folder ${folderId}: ${docs.length} documents`);
          allDocuments.push(...docs);
        }
      } catch (error) {
        console.warn(`[DEBUG] Failed to fetch from folder ${folderId}:`, error);
      }
    }
    
    console.log(`[DEBUG] Fetched ${allDocuments.length} total documents from all locations`);
    return allDocuments;
  }

  async fetchBlocks(documentId: string, maxDepth = -1): Promise<CraftBlock[]> {
    const response = await this.fetchAPI<any>('/blocks', {
      id: documentId,
      maxDepth: maxDepth.toString(),
    });
    
    // Handle array response
    if (Array.isArray(response)) {
      return response;
    }
    
    // Handle single block object (root page) - wrap it in an array
    if (response && response.id && response.type) {
      return [response];
    }
    
    // Handle object with blocks property
    if (response && Array.isArray(response.blocks)) {
      return response.blocks;
    }
    
    console.warn('Unexpected blocks response format for doc', documentId, ':', response);
    return [];
  }

  async fetchBlocksParallel(
    documents: CraftDocument[],
    maxDepth = -1,
    concurrency = 10,
    onProgress?: (completed: number, total: number, message: string) => void
  ): Promise<Map<string, CraftBlock[]>> {
    const results = new Map<string, CraftBlock[]>();
    const queue = [...documents];
    let completed = 0;
    
    const worker = async () => {
      while (queue.length > 0) {
        const doc = queue.shift();
        if (!doc) break;
        
        try {
          const blocks = await this.fetchBlocks(doc.id, maxDepth);
          results.set(doc.id, blocks);
        } catch (error) {
          console.warn(`Failed to fetch blocks for document ${doc.id}:`, error);
          results.set(doc.id, []);
        }
        
        completed++;
        onProgress?.(
          completed,
          documents.length,
          `Loading ${doc.title || 'Untitled'} (${completed}/${documents.length})...`
        );
      }
    };
    
    await Promise.all(
      Array(Math.min(concurrency, documents.length))
        .fill(0)
        .map(() => worker())
    );
    
    return results;
  }

  async buildGraphStreaming(options: GraphBuildStreamingOptions = {}): Promise<GraphData> {
    const {
      maxDepth = -1,
      excludeDeleted = true,
      callbacks,
    } = options;

    callbacks?.onProgress?.(0, 0, 'Fetching documents...');
    
    const allDocuments = await this.fetchDocuments();
    const documents = excludeDeleted
      ? allDocuments.filter(doc => !doc.deleted)
      : allDocuments;

    callbacks?.onProgress?.(0, documents.length, `Found ${documents.length} documents`);

    const nodesMap = new Map<string, GraphNode>();
    const linksMap = new Map<string, Set<string>>();
    const blockToDocMap = new Map<string, string>();
    
    for (const doc of documents) {
      nodesMap.set(doc.id, {
        id: doc.id,
        title: doc.title || 'Untitled',
        type: 'document',
        linkCount: 0,
      });
      blockToDocMap.set(doc.id, doc.id);
    }
    
    callbacks?.onNodesReady?.(Array.from(nodesMap.values()));

    const blocksMap = new Map<string, CraftBlock[]>();
    const queue = [...documents];
    let completed = 0;
    const concurrency = 10;
    const discoveredLinks: GraphLink[] = [];
    
    const addBlocksToMap = (docId: string, blocks: CraftBlock[]) => {
      for (const block of blocks) {
        blockToDocMap.set(block.id, docId);
        if (block.content) {
          addBlocksToMap(docId, block.content);
        }
      }
    };
    
    const worker = async () => {
      while (queue.length > 0) {
        const doc = queue.shift();
        if (!doc) break;
        
        try {
          const blocks = await this.fetchBlocks(doc.id, maxDepth);
          blocksMap.set(doc.id, blocks);
          addBlocksToMap(doc.id, blocks);
          
          const newLinks: GraphLink[] = [];
          const newNodes: GraphNode[] = [];
          
          for (const block of blocks) {
            const links = extractLinksFromBlock(block);
            
            if (links.length > 0) {
              if (!linksMap.has(doc.id)) {
                linksMap.set(doc.id, new Set());
              }
              
              for (const targetId of links) {
                const targetDocId = blockToDocMap.get(targetId) || targetId;
                
                linksMap.get(doc.id)!.add(targetDocId);
                
                if (!nodesMap.has(targetDocId)) {
                  const targetDoc = documents.find(d => d.id === targetDocId);
                  
                  if (targetDoc || blockToDocMap.has(targetId)) {
                    const newNode: GraphNode = {
                      id: targetDocId,
                      title: targetDoc?.title || `Unknown ${targetDocId}`,
                      type: targetDoc ? 'document' : 'block',
                      linkCount: 0,
                    };
                    nodesMap.set(targetDocId, newNode);
                    newNodes.push(newNode);
                  }
                }
                
                if (doc.id !== targetDocId && nodesMap.has(targetDocId)) {
                  newLinks.push({ source: doc.id, target: targetDocId });
                }
              }
            }
          }
          
          if (newLinks.length > 0 || newNodes.length > 0) {
            discoveredLinks.push(...newLinks);
            
            const validLinks = newLinks.filter(link => 
              nodesMap.has(link.source) && nodesMap.has(link.target)
            );
            
            if (validLinks.length > 0 || newNodes.length > 0) {
              callbacks?.onLinksDiscovered?.(validLinks, newNodes.length > 0 ? newNodes : undefined);
            }
          }
        } catch (error) {
          console.warn(`Failed to fetch blocks for document ${doc.id}:`, error);
          blocksMap.set(doc.id, []);
        }
        
        completed++;
        callbacks?.onProgress?.(
          completed,
          documents.length,
          `Loading ${doc.title || 'Untitled'} (${completed}/${documents.length})...`
        );
      }
    };
    
    await Promise.all(
      Array(Math.min(concurrency, documents.length))
        .fill(0)
        .map(() => worker())
    );

    callbacks?.onProgress?.(documents.length, documents.length, 'Finalizing graph...');

    const graphData = buildGraphData(documents, blocksMap);

    for (const node of graphData.nodes) {
      node.color = calculateNodeColor(node.linkCount);
    }

    callbacks?.onComplete?.(graphData);

    return graphData;
  }

  async buildGraph(options: GraphBuildOptions = {}): Promise<GraphData> {
    const {
      maxDepth = -1,
      excludeDeleted = true,
      onProgress,
    } = options;

    onProgress?.(0, 0, 'Fetching documents...');
    
    const allDocuments = await this.fetchDocuments();
    const documents = excludeDeleted
      ? allDocuments.filter(doc => !doc.deleted)
      : allDocuments;

    onProgress?.(0, documents.length, `Found ${documents.length} documents`);

    const blocksMap = await this.fetchBlocksParallel(
      documents,
      maxDepth,
      10,
      onProgress
    );

    onProgress?.(documents.length, documents.length, 'Building graph...');

    const graphData = buildGraphData(documents, blocksMap);

    const documentNodes = graphData.nodes.filter(n => n.type === 'document');
    console.log('[Graph] Built graph with', documentNodes.length, 'document nodes,', graphData.links.length, 'links');

    for (const node of graphData.nodes) {
      node.color = calculateNodeColor(node.linkCount);
    }

    onProgress?.(
      documents.length,
      documents.length,
      `Complete: ${documentNodes.length} documents, ${graphData.links.length} links`
    );

    return graphData;
  }

  async buildGraphIncremental(
    cachedMetadata: DocumentMetadata[],
    cachedGraphData: GraphData,
    options: GraphBuildStreamingOptions = {}
  ): Promise<GraphUpdateResult> {
    const { maxDepth = -1, callbacks } = options;

    callbacks?.onProgress?.(0, 0, 'Checking for updates...');
    
    const currentDocuments = await this.fetchDocuments(true);
    const currentDocMap = new Map(currentDocuments.map(doc => [doc.id, doc]));
    const cachedDocMap = new Map(cachedMetadata.map(doc => [doc.id, doc]));
    
    const added: string[] = [];
    const modified: string[] = [];
    const deleted: string[] = [];
    
    for (const doc of currentDocuments) {
      const cached = cachedDocMap.get(doc.id);
      if (!cached) {
        added.push(doc.id);
      } else {
        // More robust change detection:
        // 1. Compare lastModifiedAt if both exist
        // 2. If cached has no lastModifiedAt but current does, consider modified
        // 3. If current has no lastModifiedAt but cached does, consider modified
        // 4. If neither has lastModifiedAt, compare title as fallback
        const hasTimestampChange = 
          (doc.lastModifiedAt && cached.lastModifiedAt && doc.lastModifiedAt !== cached.lastModifiedAt) ||
          (doc.lastModifiedAt && !cached.lastModifiedAt) ||
          (!doc.lastModifiedAt && cached.lastModifiedAt);
        
        const hasTitleChange = doc.title !== cached.title;
        
        if (hasTimestampChange || hasTitleChange) {
          modified.push(doc.id);
        }
      }
    }
    
    for (const cachedDoc of cachedMetadata) {
      if (!currentDocMap.has(cachedDoc.id)) {
        deleted.push(cachedDoc.id);
      }
    }
    
    const hasChanges = added.length > 0 || modified.length > 0 || deleted.length > 0;
    
    if (!hasChanges) {
      callbacks?.onProgress?.(0, 0, 'Already up to date');
      callbacks?.onComplete?.(cachedGraphData);
      return {
        hasChanges: false,
        added: [],
        modified: [],
        deleted: [],
        graphData: cachedGraphData,
      };
    }
    
    console.log('[Incremental] Changes detected:', { 
      added: added.length, 
      modified: modified.length, 
      deleted: deleted.length,
      totalCached: cachedMetadata.length,
      totalCurrent: currentDocuments.length
    });
    
    if (modified.length > 0) {
      console.log('[Incremental] Modified documents:', modified.slice(0, 5).map(id => {
        const current = currentDocMap.get(id);
        const cached = cachedDocMap.get(id);
        return {
          id,
          title: current?.title,
          currentModified: current?.lastModifiedAt,
          cachedModified: cached?.lastModifiedAt,
        };
      }));
    }
    
    let nodesMap = new Map(cachedGraphData.nodes.map(n => [n.id, { ...n }]));
    let linksArray = [...cachedGraphData.links];
    
    if (deleted.length > 0) {
      callbacks?.onProgress?.(0, deleted.length + added.length + modified.length, 'Removing deleted documents...');
      
      for (const docId of deleted) {
        nodesMap.delete(docId);
        linksArray = linksArray.filter(link => link.source !== docId && link.target !== docId);
      }
    }
    
    const docsToFetch = [...added, ...modified];
    const blockToDocMap = new Map<string, string>();
    
    for (const [nodeId, node] of nodesMap) {
      if (node.type === 'document') {
        blockToDocMap.set(nodeId, nodeId);
      }
    }
    
    const addBlocksToMap = (docId: string, blocks: CraftBlock[]) => {
      for (const block of blocks) {
        blockToDocMap.set(block.id, docId);
        if (block.content) {
          addBlocksToMap(docId, block.content);
        }
      }
    };
    
    if (docsToFetch.length > 0) {
      const totalWork = docsToFetch.length;
      let completed = 0;
      
      for (const docId of docsToFetch) {
        const doc = currentDocMap.get(docId);
        if (!doc) continue;
        
        callbacks?.onProgress?.(
          completed + 1,
          totalWork,
          `Updating ${doc.title || 'Untitled'}...`
        );
        
        try {
          const blocks = await this.fetchBlocks(docId, maxDepth);
          addBlocksToMap(docId, blocks);
          
          linksArray = linksArray.filter(link => link.source !== docId);
          
          if (!nodesMap.has(docId)) {
            const newNode: GraphNode = {
              id: docId,
              title: doc.title || 'Untitled',
              type: 'document',
              linkCount: 0,
            };
            nodesMap.set(docId, newNode);
            callbacks?.onNodesReady?.([newNode]);
          } else {
            const existingNode = nodesMap.get(docId)!;
            existingNode.title = doc.title || 'Untitled';
          }
          
          const newLinks: GraphLink[] = [];
          const newNodes: GraphNode[] = [];
          
          for (const block of blocks) {
            const links = extractLinksFromBlock(block);
            
            for (const targetId of links) {
              const targetDocId = blockToDocMap.get(targetId) || targetId;
              
              if (!nodesMap.has(targetDocId)) {
                const targetDoc = currentDocuments.find(d => d.id === targetDocId);
                
                if (targetDoc || blockToDocMap.has(targetId)) {
                  const newNode: GraphNode = {
                    id: targetDocId,
                    title: targetDoc?.title || `Unknown ${targetDocId}`,
                    type: targetDoc ? 'document' : 'block',
                    linkCount: 0,
                  };
                  nodesMap.set(targetDocId, newNode);
                  newNodes.push(newNode);
                }
              }
              
              if (docId !== targetDocId && nodesMap.has(targetDocId)) {
                newLinks.push({ source: docId, target: targetDocId });
              }
            }
          }
          
          if (newLinks.length > 0 || newNodes.length > 0) {
            linksArray.push(...newLinks);
            
            const validLinks = newLinks.filter(link => 
              nodesMap.has(link.source) && nodesMap.has(link.target)
            );
            
            if (newNodes.length > 0) {
              callbacks?.onNodesReady?.(newNodes);
            }
            if (validLinks.length > 0) {
              callbacks?.onLinksDiscovered?.(validLinks, newNodes.length > 0 ? newNodes : undefined);
            }
          }
        } catch (error) {
          console.warn(`Failed to fetch blocks for document ${docId}:`, error);
        }
        
        completed++;
      }
    }
    
    callbacks?.onProgress?.(docsToFetch.length, docsToFetch.length, 'Recalculating graph...');
    
    const linkCounts = new Map<string, number>();
    for (const link of linksArray) {
      linkCounts.set(link.source, (linkCounts.get(link.source) || 0) + 1);
      linkCounts.set(link.target, (linkCounts.get(link.target) || 0) + 1);
    }
    
    const nodesArray = Array.from(nodesMap.values()).map(node => ({
      ...node,
      linkCount: linkCounts.get(node.id) || 0,
      color: calculateNodeColor(linkCounts.get(node.id) || 0),
    }));
    
    const finalGraphData: GraphData = {
      nodes: nodesArray,
      links: linksArray,
    };
    
    callbacks?.onComplete?.(finalGraphData);
    
    return {
      hasChanges: true,
      added,
      modified,
      deleted,
      graphData: finalGraphData,
    };
  }

  async discoverLinksViaSearch(): Promise<Map<string, string[]>> {
    const linksMap = new Map<string, string[]>();
    
    try {
      const response = await this.fetchAPI<any>('/documents/search', {
        regexps: 'block://',
      });
      
      const items = response.items || [];
      console.log(`[Search] Found ${items.length} documents with block links`);
      
      for (const item of items) {
        const documentId = item.documentId;
        const markdown = item.markdown || '';
        
        const blockLinkRegex = /\[([^\]]+)\]\(block:\/\/([^)]+)\)/g;
        let match;
        const links: string[] = [];
        
        while ((match = blockLinkRegex.exec(markdown)) !== null) {
          links.push(match[2]);
        }
        
        if (links.length > 0) {
          linksMap.set(documentId, links);
        }
      }
      
      console.log(`[Search] Extracted links from ${linksMap.size} documents`);
    } catch (error) {
      console.warn('[Search] Failed to discover links via search:', error);
    }
    
    return linksMap;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.fetchDocuments();
      return true;
    } catch {
      return false;
    }
  }
}

export function createFetcher(baseUrl: string, apiKey?: string): CraftGraphFetcher {
  return new CraftGraphFetcher({ baseUrl, apiKey });
}

