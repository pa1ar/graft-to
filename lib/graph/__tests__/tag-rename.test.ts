import { describe, expect, test } from 'bun:test';
import { applyTagRenameToMarkdown } from '../tag-rename';

describe('applyTagRenameToMarkdown', () => {
  test('renames exact match at end of string', () => {
    expect(applyTagRenameToMarkdown('corp', 'company', '#corp')).toBe('#company');
  });

  test('renames exact match followed by space', () => {
    expect(applyTagRenameToMarkdown('corp', 'company', 'tagged #corp here')).toBe('tagged #company here');
  });

  test('renames multiple occurrences', () => {
    expect(applyTagRenameToMarkdown('corp', 'company', '#corp and #corp')).toBe('#company and #company');
  });

  test('does not rename prefix match — #corporation stays when renaming #corp', () => {
    expect(applyTagRenameToMarkdown('corp', 'company', '#corporation')).toBe('#corporation');
  });

  test('renames child tag #corp/sub when renaming #corp', () => {
    expect(applyTagRenameToMarkdown('corp', 'company', '#corp/sub')).toBe('#company/sub');
  });

  test('renames both parent and child in same string', () => {
    const result = applyTagRenameToMarkdown('corp', 'company', '#corp and #corp/sub');
    expect(result).toBe('#company and #company/sub');
  });

  test('no match returns original string unchanged', () => {
    const md = 'no tags here';
    expect(applyTagRenameToMarkdown('corp', 'company', md)).toBe(md);
  });

  test('handles tag path with slashes (nested rename)', () => {
    expect(applyTagRenameToMarkdown('corp/sub', 'company/sub', '#corp/sub')).toBe('#company/sub');
  });

  test('does not rename partial nested path — #corp/other stays when renaming #corp/sub', () => {
    expect(applyTagRenameToMarkdown('corp/sub', 'company/sub', '#corp/other')).toBe('#corp/other');
  });

  test('handles special regex chars in tag path', () => {
    expect(applyTagRenameToMarkdown('a.b', 'c', '#a.b')).toBe('#c');
  });

  test('tag followed by punctuation is renamed', () => {
    expect(applyTagRenameToMarkdown('corp', 'company', '#corp.')).toBe('#company.');
  });

  test('tag followed by comma is renamed', () => {
    expect(applyTagRenameToMarkdown('corp', 'company', '#corp, other')).toBe('#company, other');
  });

  test('empty markdown returns empty string', () => {
    expect(applyTagRenameToMarkdown('corp', 'company', '')).toBe('');
  });
});
