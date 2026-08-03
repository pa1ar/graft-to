import { describe, expect, test } from 'bun:test';
import {
  CraftGraphBuildError,
  CraftGraphFetcher,
  detectDocumentChanges,
} from '../fetcher';
import type { DocumentMetadata } from '../types';

describe('detectDocumentChanges', () => {
  test('no changes returns all empty arrays', () => {
    const cached: DocumentMetadata[] = [
      { id: 'a', title: 'Doc A', lastModifiedAt: '2024-01-01' },
      { id: 'b', title: 'Doc B', lastModifiedAt: '2024-01-02' },
    ];
    const current = [
      { id: 'a', title: 'Doc A', lastModifiedAt: '2024-01-01' },
      { id: 'b', title: 'Doc B', lastModifiedAt: '2024-01-02' },
    ];
    const result = detectDocumentChanges(cached, current);
    expect(result.added).toEqual([]);
    expect(result.modified).toEqual([]);
    expect(result.deleted).toEqual([]);
  });

  test('new document appears in added', () => {
    const cached: DocumentMetadata[] = [
      { id: 'a', title: 'Doc A', lastModifiedAt: '2024-01-01' },
    ];
    const current = [
      { id: 'a', title: 'Doc A', lastModifiedAt: '2024-01-01' },
      { id: 'b', title: 'Doc B', lastModifiedAt: '2024-01-02' },
    ];
    const result = detectDocumentChanges(cached, current);
    expect(result.added).toEqual(['b']);
    expect(result.modified).toEqual([]);
    expect(result.deleted).toEqual([]);
  });

  test('modified timestamp appears in modified', () => {
    const cached: DocumentMetadata[] = [
      { id: 'a', title: 'Doc A', lastModifiedAt: '2024-01-01' },
    ];
    const current = [
      { id: 'a', title: 'Doc A', lastModifiedAt: '2024-02-01' },
    ];
    const result = detectDocumentChanges(cached, current);
    expect(result.added).toEqual([]);
    expect(result.modified).toEqual(['a']);
    expect(result.deleted).toEqual([]);
  });

  test('modified title appears in modified', () => {
    const cached: DocumentMetadata[] = [
      { id: 'a', title: 'Doc A', lastModifiedAt: '2024-01-01' },
    ];
    const current = [
      { id: 'a', title: 'Renamed Doc A', lastModifiedAt: '2024-01-01' },
    ];
    const result = detectDocumentChanges(cached, current);
    expect(result.added).toEqual([]);
    expect(result.modified).toEqual(['a']);
    expect(result.deleted).toEqual([]);
  });

  test('deleted document appears in deleted', () => {
    const cached: DocumentMetadata[] = [
      { id: 'a', title: 'Doc A', lastModifiedAt: '2024-01-01' },
      { id: 'b', title: 'Doc B', lastModifiedAt: '2024-01-02' },
    ];
    const current = [
      { id: 'a', title: 'Doc A', lastModifiedAt: '2024-01-01' },
    ];
    const result = detectDocumentChanges(cached, current);
    expect(result.added).toEqual([]);
    expect(result.modified).toEqual([]);
    expect(result.deleted).toEqual(['b']);
  });

  test('mixed: added + modified + deleted in single call', () => {
    const cached: DocumentMetadata[] = [
      { id: 'a', title: 'Doc A', lastModifiedAt: '2024-01-01' },
      { id: 'b', title: 'Doc B', lastModifiedAt: '2024-01-02' },
      { id: 'c', title: 'Doc C', lastModifiedAt: '2024-01-03' },
    ];
    const current = [
      { id: 'a', title: 'Doc A', lastModifiedAt: '2024-01-01' }, // unchanged
      { id: 'b', title: 'Doc B', lastModifiedAt: '2024-02-02' }, // modified
      { id: 'd', title: 'Doc D', lastModifiedAt: '2024-01-04' }, // added
    ];
    const result = detectDocumentChanges(cached, current);
    expect(result.added).toEqual(['d']);
    expect(result.modified).toEqual(['b']);
    expect(result.deleted).toEqual(['c']);
  });

  test('timestamp appears (cached has none, current has one) is modified', () => {
    const cached: DocumentMetadata[] = [
      { id: 'a', title: 'Doc A' }, // no lastModifiedAt
    ];
    const current = [
      { id: 'a', title: 'Doc A', lastModifiedAt: '2024-01-01' },
    ];
    const result = detectDocumentChanges(cached, current);
    expect(result.modified).toEqual(['a']);
  });

  test('timestamp disappears (cached has one, current has none) is modified', () => {
    const cached: DocumentMetadata[] = [
      { id: 'a', title: 'Doc A', lastModifiedAt: '2024-01-01' },
    ];
    const current = [
      { id: 'a', title: 'Doc A' }, // no lastModifiedAt
    ];
    const result = detectDocumentChanges(cached, current);
    expect(result.modified).toEqual(['a']);
  });

  test('empty inputs return all empty arrays', () => {
    const result = detectDocumentChanges([], []);
    expect(result.added).toEqual([]);
    expect(result.modified).toEqual([]);
    expect(result.deleted).toEqual([]);
  });
});

describe('CraftGraphFetcher resilience', () => {
  test('retries transient 5xx responses like craft-cli', async () => {
    let calls = 0;
    const mockFetch = (async () => {
      calls++;
      if (calls === 1) return new Response('{}', { status: 502 });
      return Response.json({ items: [] });
    }) as typeof fetch;

    const fetcher = new CraftGraphFetcher(
      { baseUrl: 'https://example.test/api/v1', apiKey: 'test' },
      { minRequestIntervalMs: 0, backoffBaseMs: 0, random: () => 0, fetch: mockFetch }
    );

    await expect(fetcher.fetchAllDocuments()).resolves.toEqual([]);
    expect(calls).toBe(2);
  });

  test('rejects an incomplete full graph so it cannot be cached', async () => {
    const mockFetch = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/documents')) {
        return Response.json({
          items: [{ id: 'doc-1', title: 'Rate-limited document' }],
        });
      }
      if (url.pathname.endsWith('/blocks')) {
        return new Response('{"error":"upstream failed"}', { status: 500 });
      }
      return new Response('{}', { status: 404 });
    }) as typeof fetch;

    const fetcher = new CraftGraphFetcher(
      { baseUrl: 'https://example.test/api/v1', apiKey: 'test' },
      { minRequestIntervalMs: 0, maxRetries: 0, fetch: mockFetch }
    );

    await expect(fetcher.buildGraphOptimized()).rejects.toBeInstanceOf(CraftGraphBuildError);
  });

  test('rejects an incomplete incremental graph so cached metadata stays retryable', async () => {
    const mockFetch = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/documents')) {
        return Response.json({
          items: [{ id: 'doc-1', title: 'Changed document', lastModifiedAt: '2026-08-03' }],
        });
      }
      if (url.pathname.endsWith('/documents/search')) {
        return Response.json({ items: [] });
      }
      if (url.pathname.endsWith('/blocks')) {
        return new Response('{"error":"upstream failed"}', { status: 502 });
      }
      return new Response('{}', { status: 404 });
    }) as typeof fetch;

    const fetcher = new CraftGraphFetcher(
      { baseUrl: 'https://example.test/api/v1', apiKey: 'test' },
      { minRequestIntervalMs: 0, maxRetries: 0, fetch: mockFetch }
    );

    await expect(fetcher.buildGraphIncrementalOptimized(
      [{ id: 'doc-1', title: 'Changed document', lastModifiedAt: '2026-08-02' }],
      {
        nodes: [{ id: 'doc-1', title: 'Changed document', type: 'document', linkCount: 0 }],
        links: [],
      }
    )).rejects.toBeInstanceOf(CraftGraphBuildError);
  });
});
