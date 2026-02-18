/**
 * IndexedDB caching layer for graph data.
 * Provides instant loading on subsequent visits.
 */

import type { GraphData, GraphCache, DocumentMetadata } from './types';

const DB_NAME = 'graft-cache';
const DB_VERSION = 1;
const STORE_NAME = 'graphs';
const CACHE_VERSION = 4; // Bumped for optimized fetching with timestamps
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function getCacheKey(apiUrl: string): string {
  return `graph_${hashString(apiUrl)}`;
}

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

export async function getCachedGraphWithMetadata(apiUrl: string): Promise<GraphCache | null> {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const key = getCacheKey(apiUrl);
    
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cached = request.result as GraphCache | undefined;
        
        if (!cached) {
          resolve(null);
          return;
        }
        
        if (cached.version !== CACHE_VERSION) {
          console.log('[Cache] Version mismatch, invalidating cache');
          resolve(null);
          return;
        }
        
        const age = Date.now() - cached.timestamp;
        if (age > CACHE_TTL_MS) {
          console.log('[Cache] Cache expired, age:', Math.round(age / 1000 / 60), 'minutes');
          resolve(null);
          return;
        }
        
        console.log('[Cache] Hit! Age:', Math.round(age / 1000 / 60), 'minutes');
        resolve(cached);
      };
    });
  } catch (error) {
    console.warn('[Cache] Failed to read cache:', error);
    return null;
  }
}

export async function getCachedGraph(apiUrl: string): Promise<GraphData | null> {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const key = getCacheKey(apiUrl);
    
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cached = request.result as GraphCache | undefined;
        
        if (!cached) {
          resolve(null);
          return;
        }
        
        if (cached.version !== CACHE_VERSION) {
          console.log('[Cache] Version mismatch, invalidating cache');
          resolve(null);
          return;
        }
        
        const age = Date.now() - cached.timestamp;
        if (age > CACHE_TTL_MS) {
          console.log('[Cache] Cache expired, age:', Math.round(age / 1000 / 60), 'minutes');
          resolve(null);
          return;
        }
        
        console.log('[Cache] Hit! Age:', Math.round(age / 1000 / 60), 'minutes');
        resolve(cached.graphData);
      };
    });
  } catch (error) {
    console.warn('[Cache] Failed to read cache:', error);
    return null;
  }
}

export async function setCachedGraph(
  apiUrl: string,
  graphData: GraphData,
  documentMetadata: import('./types').DocumentMetadata[]
): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const key = getCacheKey(apiUrl);
    
    const cache: GraphCache = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      apiUrl,
      documentCount: graphData.nodes.filter(n => n.type === 'document').length,
      documentMetadata,
      graphData,
    };
    
    return new Promise((resolve, reject) => {
      const request = store.put(cache, key);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        console.log('[Cache] Saved graph with', cache.documentCount, 'documents');
        resolve();
      };
    });
  } catch (error) {
    console.warn('[Cache] Failed to save cache:', error);
  }
}

/**
 * Patch cached graphData after a tag rename without invalidating the cache.
 * Updates tag node IDs, titles, metadata, and link sources in-place.
 * Leaves documentMetadata timestamps unchanged so the next incremental load
 * only re-fetches the documents that were actually modified by the rename.
 */
export async function patchTagRenameInCache(
  apiUrl: string,
  renameMap: Map<string, string>
): Promise<void> {
  const cached = await getCachedGraphWithMetadata(apiUrl);
  if (!cached) return;

  // build old tag node ID → new tag node ID mapping
  const idMap = new Map<string, string>();
  for (const [oldPath, newPath] of renameMap) {
    idMap.set(`tag:${oldPath}`, `tag:${newPath}`);
  }

  // if any target tag already exists as a separate node, merging is complex —
  // fall back to clearing the cache so the next full rebuild produces correct state
  const existingIds = new Set(cached.graphData.nodes.map(n => n.id));
  for (const [oldId, newId] of idMap) {
    if (oldId !== newId && existingIds.has(newId)) {
      console.warn(`[Cache] Tag collision: ${newId} already exists, clearing cache instead of patching`);
      await clearCache(apiUrl);
      return;
    }
  }

  const links = cached.graphData.links.map(link => {
    const src = typeof link.source === 'object' ? (link.source as any).id : link.source;
    const tgt = typeof link.target === 'object' ? (link.target as any).id : link.target;
    const newSrc = idMap.get(src) ?? src;
    const newTgt = idMap.get(tgt) ?? tgt;
    return newSrc === src && newTgt === tgt ? link : { source: newSrc, target: newTgt };
  });

  // recompute linkCount from the patched links so counts stay accurate
  const linkCounts = new Map<string, number>();
  for (const link of links) {
    const src = typeof link.source === 'object' ? (link.source as any).id : link.source;
    const tgt = typeof link.target === 'object' ? (link.target as any).id : link.target;
    linkCounts.set(src, (linkCounts.get(src) ?? 0) + 1);
    linkCounts.set(tgt, (linkCounts.get(tgt) ?? 0) + 1);
  }

  const nodes = cached.graphData.nodes.map(node => {
    if (node.type === 'tag') {
      const newId = idMap.get(node.id);
      if (!newId) return { ...node, linkCount: linkCounts.get(node.id) ?? node.linkCount };
      const newTagPath = renameMap.get(node.metadata?.tagPath ?? '') ?? node.metadata?.tagPath ?? '';
      return {
        ...node,
        id: newId,
        title: `#${newTagPath}`,
        linkCount: linkCounts.get(newId) ?? node.linkCount,
        metadata: { ...node.metadata, tagPath: newTagPath, isNestedTag: newTagPath.includes('/') },
      };
    }

    // patch linkedFrom references on document/block nodes
    const linkedFrom = node.linkedFrom?.some(id => idMap.has(id))
      ? node.linkedFrom.map(id => idMap.get(id) ?? id)
      : node.linkedFrom;

    return { ...node, linkCount: linkCounts.get(node.id) ?? node.linkCount, linkedFrom };
  });

  await setCachedGraph(apiUrl, { nodes, links }, cached.documentMetadata);
  console.log('[Cache] Patched tag rename in cache:', [...renameMap.entries()].map(([o, n]) => `${o}→${n}`).join(', '));
}

export async function clearCache(apiUrl?: string): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    if (apiUrl) {
      const key = getCacheKey(apiUrl);
      await new Promise<void>((resolve, reject) => {
        const request = store.delete(key);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
      console.log('[Cache] Cleared cache for', apiUrl);
    } else {
      await new Promise<void>((resolve, reject) => {
        const request = store.clear();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
      console.log('[Cache] Cleared all caches');
    }
  } catch (error) {
    console.warn('[Cache] Failed to clear cache:', error);
  }
}

export async function clearAllData(): Promise<void> {
  try {
    await clearCache();
    
    if (typeof indexedDB !== 'undefined') {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(DB_NAME);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          console.log('[Cache] Deleted IndexedDB database');
          resolve();
        };
        request.onblocked = () => {
          console.warn('[Cache] Database deletion blocked');
          resolve();
        };
      });
    }
  } catch (error) {
    console.warn('[Cache] Failed to clear all data:', error);
  }
}

export async function shouldRefreshCache(
  apiUrl: string,
  currentDocCount: number
): Promise<boolean> {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const key = getCacheKey(apiUrl);
    
    return new Promise((resolve) => {
      const request = store.get(key);
      
      request.onerror = () => resolve(true);
      request.onsuccess = () => {
        const cached = request.result as GraphCache | undefined;
        
        if (!cached) {
          resolve(true);
          return;
        }
        
        const age = Date.now() - cached.timestamp;
        if (age > CACHE_TTL_MS) {
          console.log('[Cache] Cache expired');
          resolve(true);
          return;
        }
        
        if (cached.documentCount !== currentDocCount) {
          console.log('[Cache] Document count changed:', cached.documentCount, '->', currentDocCount);
          resolve(true);
          return;
        }
        
        resolve(false);
      };
    });
  } catch (error) {
    console.warn('[Cache] Failed to check cache freshness:', error);
    return true;
  }
}

