import { describe, expect, test } from 'bun:test';
import { detectDocumentChanges } from '../fetcher';
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
