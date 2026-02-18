import { describe, expect, test } from 'bun:test';
import { extractHashtags, extractTagsFromBlock, extractBlockLinks, extractLinksFromBlock } from '../parser';
import type { CraftBlock } from '../types';

describe('extractHashtags', () => {
  test('extracts simple tag', () => {
    expect(extractHashtags('#hello')).toContain('hello');
  });

  test('extracts nested tag and auto-creates parents', () => {
    const tags = extractHashtags('#project/work/task');
    expect(tags).toContain('project/work/task');
    expect(tags).toContain('project/work');
    expect(tags).toContain('project');
  });

  test('deduplicates tags', () => {
    const tags = extractHashtags('#tag #tag #tag');
    expect(tags.filter(t => t === 'tag')).toHaveLength(1);
  });

  test('extracts multiple different tags', () => {
    const tags = extractHashtags('#alpha #beta');
    expect(tags).toContain('alpha');
    expect(tags).toContain('beta');
  });

  test('ignores text without #', () => {
    expect(extractHashtags('no tags here')).toEqual([]);
  });

  test('does not extract tags with invalid chars', () => {
    const tags = extractHashtags('#hello world');
    expect(tags).toContain('hello');
    expect(tags).not.toContain('hello world');
  });

  test('empty string returns empty array', () => {
    expect(extractHashtags('')).toEqual([]);
  });
});

describe('extractTagsFromBlock', () => {
  function block(id: string, markdown?: string, content?: CraftBlock[]): CraftBlock {
    return { id, type: 'text', markdown, content };
  }

  test('extracts tags from markdown', () => {
    const b = block('1', '#corp tagged');
    expect(extractTagsFromBlock(b)).toContain('corp');
  });

  test('recurses into nested content', () => {
    const child = block('child', '#nested');
    const parent = block('parent', undefined, [child]);
    expect(extractTagsFromBlock(parent)).toContain('nested');
  });

  test('returns empty for block with no markdown', () => {
    expect(extractTagsFromBlock(block('1'))).toEqual([]);
  });
});
