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

