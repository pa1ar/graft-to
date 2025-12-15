/**
 * Craft Document Graph Library
 * 
 * A standalone, framework-agnostic library for building graph visualizations
 * from Craft document relationships.
 * 
 * @example
 * ```typescript
 * import { createFetcher } from '@/lib/graph';
 * 
 * const fetcher = createFetcher(apiUrl, apiKey);
 * const graph = await fetcher.buildGraph({
 *   onProgress: (current, total, message) => {
 *     console.log(`${current}/${total}: ${message}`);
 *   }
 * });
 * ```
 */

export * from './types';
export * from './parser';
export * from './fetcher';

