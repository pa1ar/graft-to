/**
 * Core types for Craft document graph visualization.
 * This module is framework-agnostic and can be reused in any environment.
 */

export interface GraphNode {
  id: string;
  title: string;
  type: 'document' | 'block';
  linkCount: number;
  color?: string;
  linksTo?: string[];
  linkedFrom?: string[];
  clickableLink?: string;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface CraftBlock {
  id: string;
  type: string;
  markdown?: string;
  textStyle?: string;
  content?: CraftBlock[];
}

export interface CraftDocument {
  id: string;
  title: string;
  deleted?: boolean;
  lastModifiedAt?: string;
  createdAt?: string;
  clickableLink?: string;
}

export interface CraftAPIConfig {
  baseUrl: string;
  apiKey?: string;
}

export interface GraphBuildOptions {
  maxDepth?: number;
  excludeDeleted?: boolean;
  onProgress?: (current: number, total: number, message: string) => void;
}

export interface GraphStreamCallbacks {
  onNodesReady?: (nodes: GraphNode[]) => void;
  onLinksDiscovered?: (links: GraphLink[], newNodes?: GraphNode[]) => void;
  onProgress?: (current: number, total: number, message: string) => void;
  onComplete?: (graphData: GraphData) => void;
}

export interface GraphBuildStreamingOptions {
  maxDepth?: number;
  excludeDeleted?: boolean;
  callbacks?: GraphStreamCallbacks;
}

export interface GraphStats {
  totalDocuments: number;
  totalNodes: number;
  totalLinks: number;
  orphanNodes: number;
  mostConnectedNode: {
    id: string;
    title: string;
    connections: number;
  } | null;
}

export interface DocumentMetadata {
  id: string;
  title: string;
  lastModifiedAt?: string;
  deleted?: boolean;
}

export interface GraphCache {
  version: number;
  timestamp: number;
  apiUrl: string;
  documentCount: number;
  documentMetadata: DocumentMetadata[];
  graphData: GraphData;
}

export interface GraphUpdateResult {
  hasChanges: boolean;
  added: string[];
  modified: string[];
  deleted: string[];
  graphData: GraphData;
}

