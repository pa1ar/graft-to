import { describe, expect, test } from 'bun:test';
import { applyTagRenameToMarkdown } from '../tag-rename';

describe('tag-rename', () => {
  test('smoke', () => {
    expect(applyTagRenameToMarkdown('a', 'b', '#a')).toBe('#b');
  });
});
