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

describe('extractBlockLinks', () => {
  test('extracts block:// link ID', () => {
    expect(extractBlockLinks('[text](block://abc123)')).toEqual(['abc123']);
  });

  test('extracts multiple links', () => {
    const links = extractBlockLinks('[a](block://id1) [b](block://id2)');
    expect(links).toEqual(['id1', 'id2']);
  });

  test('returns empty for no block links', () => {
    expect(extractBlockLinks('no links here')).toEqual([]);
  });

  test('ignores non-block:// links', () => {
    expect(extractBlockLinks('[text](https://example.com)')).toEqual([]);
  });
});

describe('extractLinksFromBlock', () => {
  function blockWithLinks(id: string, markdown?: string, content?: CraftBlock[]): CraftBlock {
    return { id, type: 'text', markdown, content };
  }

  test('extracts links from markdown', () => {
    const b = blockWithLinks('1', '[ref](block://target)');
    expect(extractLinksFromBlock(b)).toContain('target');
  });

  test('recurses into nested content blocks', () => {
    const child = blockWithLinks('child', '[ref](block://deep)');
    const parent = blockWithLinks('parent', undefined, [child]);
    expect(extractLinksFromBlock(parent)).toContain('deep');
  });

  test('returns empty when no links', () => {
    expect(extractLinksFromBlock(blockWithLinks('1', 'plain text'))).toEqual([]);
  });
});
