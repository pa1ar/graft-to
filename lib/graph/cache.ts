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

