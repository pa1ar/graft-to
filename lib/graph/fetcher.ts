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
} from './types';
import { buildGraphData, calculateNodeColor } from './parser';

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

  async fetchDocuments(): Promise<CraftDocument[]> {
    const response = await this.fetchAPI<any>('/documents');
    
    // Handle both possible response formats
    if (Array.isArray(response)) {
      return response;
    }
    if (response && Array.isArray(response.items)) {
      return response.items;
    }
    if (response && Array.isArray(response.documents)) {
      return response.documents;
    }
    
    console.error('Unexpected documents response format:', response);
    console.error('Response keys:', Object.keys(response || {}));
    throw new CraftAPIError('Unexpected API response format for documents');
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

    const blocksMap = new Map<string, CraftBlock[]>();

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      onProgress?.(
        i + 1,
        documents.length,
        `Loading ${doc.title || 'Untitled'}...`
      );

      try {
        const blocks = await this.fetchBlocks(doc.id, maxDepth);
        blocksMap.set(doc.id, blocks);
      } catch (error) {
        console.warn(`Failed to fetch blocks for document ${doc.id}:`, error);
        blocksMap.set(doc.id, []);
      }
    }

    onProgress?.(documents.length, documents.length, 'Building graph...');

    const graphData = buildGraphData(documents, blocksMap);

    for (const node of graphData.nodes) {
      node.color = calculateNodeColor(node.linkCount);
    }

    onProgress?.(
      documents.length,
      documents.length,
      `Complete: ${graphData.nodes.length} nodes, ${graphData.links.length} links`
    );

    return graphData;
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

