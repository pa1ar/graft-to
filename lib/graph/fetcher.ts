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
  GraphBuildResult,
} from './types';
import { buildGraphData, calculateNodeColor, extractLinksFromBlock, rebuildNodeRelationships, extractBlockLinks } from './parser';

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

  /**
   * Fetch all documents with a single API call.
   * No location filter = returns ALL documents in the space.
   */
  async fetchAllDocuments(fetchMetadata = true): Promise<CraftDocument[]> {
    const params: Record<string, string> = {};
    if (fetchMetadata) {
      params.fetchMetadata = 'true';
    }
    
    console.log('[Fetch] Getting all documents with single API call...');
    const response = await this.fetchAPI<any>('/documents', params);
    
    const docs = response.items || response.documents || response;
    if (!Array.isArray(docs)) {
      console.warn('[Fetch] Unexpected response format:', response);
      return [];
    }
    
    // Extract spaceId from first document if available
    if (docs.length > 0 && docs[0].clickableLink && typeof window !== 'undefined') {
      const match = docs[0].clickableLink.match(/spaceId=([^&]+)/);
      if (match) {
        localStorage.setItem('craft_space_id', match[1]);
      }
    }
    
    console.log(`[Fetch] Got ${docs.length} documents in single call`);
    return docs;
  }

  /**
   * Legacy method - redirects to optimized version
   * @deprecated Use fetchAllDocuments instead
   */
  async fetchDocuments(fetchMetadata = true): Promise<CraftDocument[]> {
    return this.fetchAllDocuments(fetchMetadata);
  }

  async fetchSpaceId(): Promise<string | null> {
    // Try to get from localStorage first
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('craft_space_id');
      if (stored) return stored;
    }

    try {
      // PRIMARY METHOD: Try fetching a document with metadata to get clickableLink
      // This is the most reliable way to get spaceId
      try {
        const documentsResponse = await this.fetchAPI<any>('/documents', { 
          location: 'unsorted',
          fetchMetadata: 'true'
        });
        
        if (documentsResponse.items && Array.isArray(documentsResponse.items) && documentsResponse.items.length > 0) {
          const firstDoc = documentsResponse.items[0];
          
          // Extract spaceId from clickableLink
          if (firstDoc.clickableLink) {
            const match = firstDoc.clickableLink.match(/spaceId=([^&]+)/);
            if (match) {
              const spaceId = match[1];
              if (typeof window !== 'undefined') {
                localStorage.setItem('craft_space_id', spaceId);
              }
              console.log('[SpaceId] Extracted from clickableLink:', spaceId);
              return spaceId;
            }
          }
          
          // Fallback: check if spaceId is directly in the document object
          if (firstDoc.spaceId) {
            const spaceId = String(firstDoc.spaceId);
            if (typeof window !== 'undefined') {
              localStorage.setItem('craft_space_id', spaceId);
            }
            return spaceId;
          }
        }
      } catch (err) {
        console.warn('[SpaceId] Failed to fetch documents:', err);
      }

      // Check folders endpoint for spaceId
      const foldersResponse = await this.fetchAPI<any>('/folders');
      
      // Check various possible locations for spaceId in the response
      if (foldersResponse.spaceId) {
        const spaceId = String(foldersResponse.spaceId);
        if (typeof window !== 'undefined') {
          localStorage.setItem('craft_space_id', spaceId);
        }
        return spaceId;
      }

      // Check if spaceId is in the response structure
      if (foldersResponse.space?.id) {
        const spaceId = String(foldersResponse.space.id);
        if (typeof window !== 'undefined') {
          localStorage.setItem('craft_space_id', spaceId);
        }
        return spaceId;
      }

      // Check if spaceId is in items (some APIs nest it)
      if (foldersResponse.items && Array.isArray(foldersResponse.items) && foldersResponse.items.length > 0) {
        const firstItem = foldersResponse.items[0];
        if (firstItem.spaceId) {
          const spaceId = String(firstItem.spaceId);
          if (typeof window !== 'undefined') {
            localStorage.setItem('craft_space_id', spaceId);
          }
          return spaceId;
        }
      }

      // Try to extract from API URL
      const apiUrl = this.config.baseUrl;
      // Check if spaceId is in URL path
      const spaceIdMatch = apiUrl.match(/\/spaces\/([a-f0-9-]+)/i);
      if (spaceIdMatch) {
        const spaceId = spaceIdMatch[1];
        if (typeof window !== 'undefined') {
          localStorage.setItem('craft_space_id', spaceId);
        }
        return spaceId;
      }

      // Check if spaceId is a query parameter
      try {
        const url = new URL(apiUrl);
        const spaceIdParam = url.searchParams.get('spaceId');
        if (spaceIdParam) {
          if (typeof window !== 'undefined') {
            localStorage.setItem('craft_space_id', spaceIdParam);
          }
          return spaceIdParam;
        }
      } catch {
        // Invalid URL, ignore
      }
    } catch (error) {
      console.warn('[SpaceId] Failed to fetch spaceId:', error);
    }

    return null;
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
        clickableLink: doc.clickableLink,
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
                      clickableLink: targetDoc?.clickableLink,
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

    let graphData = buildGraphData(documents, blocksMap);

    for (const node of graphData.nodes) {
      node.color = calculateNodeColor(node.linkCount);
    }

    // Rebuild node relationships to ensure linksTo and linkedFrom are up to date
    graphData = rebuildNodeRelationships(graphData);

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
    
    // Build fresh document metadata
    const documentMetadata: DocumentMetadata[] = currentDocuments
      .filter(doc => !doc.deleted)
      .map(doc => ({
        id: doc.id,
        title: doc.title,
        lastModifiedAt: doc.lastModifiedAt,
        createdAt: doc.createdAt,
        deleted: doc.deleted,
      }));
    
    if (!hasChanges) {
      callbacks?.onProgress?.(0, 0, 'Already up to date');
      callbacks?.onComplete?.(cachedGraphData);
      return {
        hasChanges: false,
        added: [],
        modified: [],
        deleted: [],
        graphData: cachedGraphData,
        documentMetadata,
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
              clickableLink: doc.clickableLink,
            };
            nodesMap.set(docId, newNode);
            callbacks?.onNodesReady?.([newNode]);
          } else {
            const existingNode = nodesMap.get(docId)!;
            existingNode.title = doc.title || 'Untitled';
            existingNode.clickableLink = doc.clickableLink;
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
                    clickableLink: targetDoc?.clickableLink,
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
      const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
      const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;
      linkCounts.set(sourceId, (linkCounts.get(sourceId) || 0) + 1);
      linkCounts.set(targetId, (linkCounts.get(targetId) || 0) + 1);
    }
    
    const nodesArray = Array.from(nodesMap.values()).map(node => ({
      ...node,
      linkCount: linkCounts.get(node.id) || 0,
      color: calculateNodeColor(linkCounts.get(node.id) || 0),
    }));
    
    let finalGraphData: GraphData = {
      nodes: nodesArray,
      links: linksArray,
    };
    
    // Rebuild node relationships to ensure linksTo and linkedFrom are up to date
    finalGraphData = rebuildNodeRelationships(finalGraphData);
    
    callbacks?.onComplete?.(finalGraphData);
    
    return {
      hasChanges: true,
      added,
      modified,
      deleted,
      graphData: finalGraphData,
      documentMetadata,
    };
  }

  /**
   * Discover all document links using a single search API call.
   * Returns a map of documentId -> array of target block IDs.
   */
  async discoverLinksViaSearch(): Promise<Map<string, string[]>> {
    const linksMap = new Map<string, string[]>();
    
    try {
      console.log('[Search] Discovering links via search...');
      const response = await this.fetchAPI<any>('/documents/search', {
        regexps: 'block://',
      });
      
      const items = response.items || [];
      console.log(`[Search] Found ${items.length} search results with block links`);
      
      for (const item of items) {
        const documentId = item.documentId;
        const markdown = item.markdown || '';
        
        // Extract all block:// links from the markdown snippet
        const links = extractBlockLinks(markdown);
        
        if (links.length > 0) {
          // Merge with existing links for this document
          const existing = linksMap.get(documentId) || [];
          const combined = [...new Set([...existing, ...links])];
          linksMap.set(documentId, combined);
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

  /**
   * Optimized graph building:
   * 1. Single call to fetch all documents with metadata
   * 2. Parallel fetch of blocks for all documents (high concurrency)
   * 3. Extract links and build graph
   */
  async buildGraphOptimized(options: GraphBuildStreamingOptions = {}): Promise<GraphBuildResult> {
    const { maxDepth = -1, excludeDeleted = true, callbacks } = options;

    callbacks?.onProgress?.(0, 0, 'Fetching documents...');

    // Step 1: Fetch all documents in a single call
    const allDocuments = await this.fetchAllDocuments(true);

    const documents = excludeDeleted
      ? allDocuments.filter(doc => !doc.deleted)
      : allDocuments;

    // Sort documents by createdAt for chronological display (oldest first)
    documents.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return aTime - bTime;
    });

    callbacks?.onProgress?.(0, documents.length, `Found ${documents.length} documents`);

    // Build document metadata for caching
    const documentMetadata: DocumentMetadata[] = documents.map(doc => ({
      id: doc.id,
      title: doc.title,
      lastModifiedAt: doc.lastModifiedAt,
      createdAt: doc.createdAt,
      deleted: doc.deleted,
    }));

    // Step 2: Create nodes from documents (sorted chronologically)
    const nodesMap = new Map<string, GraphNode>();
    const blockToDocMap = new Map<string, string>();

    for (const doc of documents) {
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

    callbacks?.onNodesReady?.(Array.from(nodesMap.values()));

    // Step 3: Fetch blocks for all documents in parallel
    const linksMap = new Map<string, Set<string>>();
    let completed = 0;
    const total = documents.length;

    const addBlocksToMap = (docId: string, blocks: CraftBlock[]) => {
      for (const block of blocks) {
        blockToDocMap.set(block.id, docId);
        if (block.content) {
          addBlocksToMap(docId, block.content);
        }
      }
    };

    // High concurrency for parallel fetching
    const concurrency = 15;
    const queue = [...documents];

    const worker = async () => {
      while (queue.length > 0) {
        const doc = queue.shift();
        if (!doc) break;

        try {
          const blocks = await this.fetchBlocks(doc.id, maxDepth);
          addBlocksToMap(doc.id, blocks);

          // Extract links from blocks
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
            
            // Emit links as they're discovered
            const newLinks = Array.from(docLinks)
              .filter(targetId => nodesMap.has(targetId))
              .map(targetId => ({ source: doc.id, target: targetId }));
            
            if (newLinks.length > 0) {
              callbacks?.onLinksDiscovered?.(newLinks);
            }
          }
        } catch (error) {
          console.warn(`[Graph] Failed to fetch blocks for ${doc.id}:`, error);
        }

        completed++;
        callbacks?.onProgress?.(completed, total, `Loading ${doc.title || 'Untitled'} (${completed}/${total})...`);
      }
    };

    await Promise.all(
      Array(Math.min(concurrency, documents.length))
        .fill(0)
        .map(() => worker())
    );

    // Step 5: Build final graph
    const links: GraphLink[] = [];
    const discoveredLinks: GraphLink[] = [];

    for (const [source, targets] of linksMap.entries()) {
      const sourceNode = nodesMap.get(source);
      if (sourceNode) {
        sourceNode.linksTo = Array.from(targets);
      }

      for (const target of targets) {
        if (source !== target && nodesMap.has(target)) {
          const link = { source, target };
          links.push(link);
          discoveredLinks.push(link);

          const targetNode = nodesMap.get(target);
          if (sourceNode) sourceNode.linkCount++;
          if (targetNode) {
            targetNode.linkCount++;
            if (!targetNode.linkedFrom) targetNode.linkedFrom = [];
            targetNode.linkedFrom.push(source);
          }
        }
      }
    }

    // Emit links discovered
    if (discoveredLinks.length > 0) {
      callbacks?.onLinksDiscovered?.(discoveredLinks);
    }

    // Apply colors and finalize
    for (const node of nodesMap.values()) {
      node.color = calculateNodeColor(node.linkCount);
    }

    let graphData: GraphData = {
      nodes: Array.from(nodesMap.values()),
      links,
    };

    graphData = rebuildNodeRelationships(graphData);

    callbacks?.onProgress?.(documents.length, documents.length, 'Complete');
    callbacks?.onComplete?.(graphData);

    return { graphData, documentMetadata };
  }

  /**
   * Incremental graph update - only fetches documents modified since last sync.
   */
  async buildGraphIncrementalOptimized(
    cachedMetadata: DocumentMetadata[],
    cachedGraphData: GraphData,
    options: GraphBuildStreamingOptions = {}
  ): Promise<GraphUpdateResult> {
    const { maxDepth = -1, callbacks } = options;

    callbacks?.onProgress?.(0, 0, 'Checking for updates...');

    // Fetch current documents
    const currentDocuments = await this.fetchAllDocuments(true);
    const currentDocMap = new Map(currentDocuments.map(doc => [doc.id, doc]));
    const cachedDocMap = new Map(cachedMetadata.map(doc => [doc.id, doc]));

    // Detect changes
    const added: string[] = [];
    const modified: string[] = [];
    const deleted: string[] = [];

    for (const doc of currentDocuments) {
      const cached = cachedDocMap.get(doc.id);
      if (!cached) {
        added.push(doc.id);
      } else {
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

    // Build fresh document metadata for caching
    const documentMetadata: DocumentMetadata[] = currentDocuments
      .filter(doc => !doc.deleted)
      .map(doc => ({
        id: doc.id,
        title: doc.title,
        lastModifiedAt: doc.lastModifiedAt,
        createdAt: doc.createdAt,
        deleted: doc.deleted,
      }));

    if (!hasChanges) {
      callbacks?.onProgress?.(0, 0, 'Already up to date');
      callbacks?.onComplete?.(cachedGraphData);
      return {
        hasChanges: false,
        added: [],
        modified: [],
        deleted: [],
        graphData: cachedGraphData,
        documentMetadata,
      };
    }

    console.log('[Incremental] Changes detected:', {
      added: added.length,
      modified: modified.length,
      deleted: deleted.length,
    });

    // Start with cached data
    let nodesMap = new Map(cachedGraphData.nodes.map(n => [n.id, { ...n }]));
    let linksArray = [...cachedGraphData.links];

    // Remove deleted documents
    if (deleted.length > 0) {
      callbacks?.onProgress?.(0, deleted.length + added.length + modified.length, 'Removing deleted documents...');
      for (const docId of deleted) {
        nodesMap.delete(docId);
        linksArray = linksArray.filter(link => {
          const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
          const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;
          return sourceId !== docId && targetId !== docId;
        });
      }
    }

    // Add new and update modified documents
    const docsToProcess = [...added, ...modified];
    if (docsToProcess.length > 0) {
      // First, try to get links via search for efficiency
      const searchLinks = await this.discoverLinksViaSearch();
      const blockToDocMap = new Map<string, string>();

      // Initialize blockToDocMap with existing nodes
      for (const [nodeId, node] of nodesMap) {
        if (node.type === 'document') {
          blockToDocMap.set(nodeId, nodeId);
        }
      }

      let completed = 0;
      const totalWork = docsToProcess.length;

      for (const docId of docsToProcess) {
        const doc = currentDocMap.get(docId);
        if (!doc || doc.deleted) continue;

        callbacks?.onProgress?.(completed + 1, totalWork, `Updating ${doc.title || 'Untitled'}...`);

        // Remove old links from this document
        linksArray = linksArray.filter(link => {
          const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
          return sourceId !== docId;
        });

        // Add or update node
        const isNew = !nodesMap.has(docId);
        const node: GraphNode = {
          id: docId,
          title: doc.title || 'Untitled',
          type: 'document',
          linkCount: 0,
          clickableLink: doc.clickableLink,
          createdAt: doc.createdAt,
          lastModifiedAt: doc.lastModifiedAt,
        };
        nodesMap.set(docId, node);

        if (isNew) {
          callbacks?.onNodesReady?.([node]);
        }

        // Get links from search results or fetch blocks
        let links = searchLinks.get(docId) || [];
        
        if (links.length === 0 || links.some(id => !nodesMap.has(id) && !blockToDocMap.has(id))) {
          // Need to fetch blocks to resolve links
          try {
            const blocks = await this.fetchBlocks(docId, maxDepth);
            
            const addBlocksToMap = (blocks: CraftBlock[]) => {
              for (const block of blocks) {
                blockToDocMap.set(block.id, docId);
                if (block.content) addBlocksToMap(block.content);
              }
            };
            addBlocksToMap(blocks);

            links = [];
            for (const block of blocks) {
              links.push(...extractLinksFromBlock(block));
            }
          } catch (error) {
            console.warn(`[Incremental] Failed to fetch blocks for ${docId}:`, error);
          }
        }

        // Add new links
        const newLinks: GraphLink[] = [];
        for (const targetId of links) {
          const targetDocId = blockToDocMap.get(targetId) || targetId;
          
          if (docId !== targetDocId && (nodesMap.has(targetDocId) || currentDocMap.has(targetDocId))) {
            // Ensure target node exists
            if (!nodesMap.has(targetDocId)) {
              const targetDoc = currentDocMap.get(targetDocId);
              if (targetDoc) {
                const targetNode: GraphNode = {
                  id: targetDocId,
                  title: targetDoc.title || 'Untitled',
                  type: 'document',
                  linkCount: 0,
                  clickableLink: targetDoc.clickableLink,
                  createdAt: targetDoc.createdAt,
                  lastModifiedAt: targetDoc.lastModifiedAt,
                };
                nodesMap.set(targetDocId, targetNode);
                callbacks?.onNodesReady?.([targetNode]);
              }
            }

            if (nodesMap.has(targetDocId)) {
              newLinks.push({ source: docId, target: targetDocId });
            }
          }
        }

        if (newLinks.length > 0) {
          linksArray.push(...newLinks);
          callbacks?.onLinksDiscovered?.(newLinks);
        }

        completed++;
      }
    }

    // Recalculate link counts
    const linkCounts = new Map<string, number>();
    for (const link of linksArray) {
      const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
      const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;
      linkCounts.set(sourceId, (linkCounts.get(sourceId) || 0) + 1);
      linkCounts.set(targetId, (linkCounts.get(targetId) || 0) + 1);
    }

    const nodesArray = Array.from(nodesMap.values()).map(node => ({
      ...node,
      linkCount: linkCounts.get(node.id) || 0,
      color: calculateNodeColor(linkCounts.get(node.id) || 0),
    }));

    let finalGraphData: GraphData = {
      nodes: nodesArray,
      links: linksArray,
    };

    finalGraphData = rebuildNodeRelationships(finalGraphData);

    callbacks?.onProgress?.(docsToProcess.length, docsToProcess.length, 'Update complete');
    callbacks?.onComplete?.(finalGraphData);

    return {
      hasChanges: true,
      added,
      modified,
      deleted,
      graphData: finalGraphData,
      documentMetadata,
    };
  }
}

export function createFetcher(baseUrl: string, apiKey?: string): CraftGraphFetcher {
  return new CraftGraphFetcher({ baseUrl, apiKey });
}

