/**
 * Integration tests for tag rename against a real Craft API.
 * Uses credentials from .env (API_URL, API_KEY).
 *
 * Tests the full rename flow: search → fetch → rename → verify → revert.
 * Handles transient 502s from Craft (retries, ignores in assertions).
 */
import { describe, test, expect, afterAll, beforeAll } from 'bun:test';
import { createFetcher } from '../fetcher';
import { executeTagRename, collectChangedBlocks } from '../tag-rename';
import type { CraftGraphFetcher } from '../fetcher';

const API_URL = process.env.API_URL;
const API_KEY = process.env.API_KEY;
const canRun = !!(API_URL && API_KEY);

// unique suffix per run to avoid collisions
const SUFFIX = `_t${Date.now() % 100000}`;
const TAG = 'internal';
const TAG_TMP = TAG + SUFFIX;

describe.skipIf(!canRun)('tag rename integration (real Craft API)', () => {
  let fetcher: CraftGraphFetcher;

  beforeAll(() => {
    fetcher = createFetcher(API_URL!, API_KEY!);
  });

  // safety net: revert any leftover test tags
  afterAll(async () => {
    if (!canRun) return;
    try {
      const docs = await fetcher.findDocumentsWithTag(TAG_TMP);
      if (docs.length > 0) {
        console.log(`[Cleanup] Reverting ${docs.length} docs with #${TAG_TMP}`);
        await executeTagRename(fetcher, TAG_TMP, TAG, docs, () => {});
      }
    } catch { /* best effort */ }
  }, 60000);

  test('findDocumentsWithTag: RE2-compatible search works', async () => {
    const docIds = await fetcher.findDocumentsWithTag(TAG);
    console.log(`[Search] Found ${docIds.length} documents with #${TAG}`);
    expect(docIds.length).toBeGreaterThan(0);
  });

  test('single-doc: rename → verify → revert', async () => {
    const docIds = await fetcher.findDocumentsWithTag(TAG);

    // find a doc that actually has the tag in its blocks
    // (search index can be stale — a doc may appear in search but blocks already reverted)
    let docId = '';
    let changed: Array<{ id: string; markdown: string }> = [];
    for (const id of docIds) {
      const blocks = await fetcher.fetchBlocks(id, -1);
      const result = collectChangedBlocks(blocks, TAG, TAG_TMP);
      if (result.changed.length > 0) {
        changed = result.changed;
        docId = id;
        break;
      }
    }
    console.log(`[Single] Doc ${docId}: ${changed.length} blocks to rename`);
    expect(changed.length).toBeGreaterThan(0);

    // rename via PUT
    await fetcher.updateBlocks(changed);

    // verify: old tag is gone
    const after = await fetcher.fetchBlocks(docId, -1);
    const stillOld = collectChangedBlocks(after, TAG, 'xxx');
    expect(stillOld.changed.length).toBe(0);

    // revert
    const revert = collectChangedBlocks(after, TAG_TMP, TAG);
    expect(revert.changed.length).toBe(changed.length);
    await fetcher.updateBlocks(revert.changed);

    // verify revert
    const reverted = await fetcher.fetchBlocks(docId, -1);
    const back = collectChangedBlocks(reverted, TAG, TAG_TMP);
    expect(back.changed.length).toBe(changed.length);
    console.log(`[Single] OK`);
  }, 30000);

  test('executeTagRename: multi-doc rename + revert', async () => {
    // use 5 docs only (Phase 0 search is disabled by passing empty array for searchIds)
    const allDocs = await fetcher.findDocumentsWithTag(TAG);
    const subset = allDocs.slice(0, 5);
    console.log(`[Multi] Testing with ${subset.length} docs`);

    // rename — pass subset as documentIds; Phase 0 search will union with API results
    const result = await executeTagRename(
      fetcher, TAG, TAG_TMP, subset, () => {},
    );

    const transientErrors = result.errors.filter(e => e.error.includes('502'));
    const realErrors = result.errors.filter(e => !e.error.includes('502'));

    console.log(`[Multi] Rename: ${result.savedDocumentCount}/${result.affectedDocumentCount} saved, ${result.savedBlockCount} blocks, ${result.errors.length} errors (${transientErrors.length} transient)`);

    expect(realErrors.length).toBe(0);
    expect(result.savedDocumentCount).toBeGreaterThan(0);
    expect(result.savedBlockCount).toBeGreaterThan(0);

    // verify spot-check: first doc should have new tag, not old
    const after = await fetcher.fetchBlocks(subset[0], -1);
    const leftover = collectChangedBlocks(after, TAG, 'xxx');
    expect(leftover.changed.length).toBe(0);

    // revert
    const revertResult = await executeTagRename(
      fetcher, TAG_TMP, TAG, subset, () => {},
    );

    const revertTransient = revertResult.errors.filter(e => e.error.includes('502'));
    const revertReal = revertResult.errors.filter(e => !e.error.includes('502'));

    console.log(`[Multi] Revert: ${revertResult.savedDocumentCount}/${revertResult.affectedDocumentCount} reverted, ${revertResult.errors.length} errors (${revertTransient.length} transient)`);

    expect(revertReal.length).toBe(0);
  }, 120000);
});
