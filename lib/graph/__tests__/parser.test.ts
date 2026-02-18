import { describe, expect, test } from 'bun:test';
import { extractHashtags } from '../parser';

describe('parser', () => {
  test('smoke', () => {
    expect(extractHashtags('#hello')).toEqual(['hello']);
  });
});
