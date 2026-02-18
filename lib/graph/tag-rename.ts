/**
 * Tag rename service.
 * Handles computing the scope of a tag rename and executing it via Craft API.
 */

import type { GraphData, CraftBlock } from './types';
import type { CraftGraphFetcher } from './fetcher';

export interface TagRenamePreview {
  /** All tag paths that will be renamed (including nested children) */
  affectedTagPaths: string[];
  /** oldPath → newPath mapping for all affected tag paths */
  renameMap: Map<string, string>;
  /** Document IDs that contain any of the affected tags */
  affectedDocumentIds: string[];
}

/**
 * Compute which tag paths will be renamed (rename map only — no document lookup).
 * Pure function, works from in-memory graph data.
 * Handles nested tags: renaming "main" → "mainNew" also renames "main/sub" → "mainNew/sub".
 */
export function computeTagRenameMap(
  oldTagPath: string,
  newTagPath: string,
  graphData: GraphData
): Map<string, string> {
  const renameMap = new Map<string, string>();

  for (const node of graphData.nodes) {
    if (node.type !== 'tag') continue;
    const tagPath = node.metadata?.tagPath;
    if (!tagPath) continue;

    if (tagPath === oldTagPath) {
      renameMap.set(tagPath, newTagPath);
    } else if (tagPath.startsWith(oldTagPath + '/')) {
      const suffix = tagPath.slice(oldTagPath.length); // e.g., "/sub1/deep"
      renameMap.set(tagPath, newTagPath + suffix);
    }
  }

  // always include the renamed tag itself even if not in the current graph
  if (!renameMap.has(oldTagPath)) {
    renameMap.set(oldTagPath, newTagPath);
  }

  return renameMap;
}

/**
 * Compute the full rename preview from in-memory graph data.
 * Reads affected document IDs from graphData.links (tag→doc edges built during graph load).
 * Sync and instant — no API calls needed.
 */
export function computeTagRename(
  oldTagPath: string,
  newTagPath: string,
  graphData: GraphData
): TagRenamePreview {
  const renameMap = computeTagRenameMap(oldTagPath, newTagPath, graphData);

  // collect all affected tag node IDs (e.g. "tag:corporation", "tag:corporation/sub")
  const affectedTagIds = new Set(
    Array.from(renameMap.keys()).map(path => `tag:${path}`)
  );

  // extract document IDs from graph links where source is an affected tag node
  const docIds = new Set<string>();
  for (const link of graphData.links) {
    const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
    const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;
    if (affectedTagIds.has(sourceId)) {
      docIds.add(targetId);
    }
  }

  return {
    affectedTagPaths: Array.from(renameMap.keys()),
    renameMap,
    affectedDocumentIds: Array.from(docIds),
  };
}

/**
 * Replace occurrences of `#oldTagPath` in a markdown string with `#newTagPath`.
 * Matches the tag at a segment boundary so "#main" does not match "#mainother".
 * Also matches child tags: "#main/sub" when renaming "#main" → "#mainNew".
 */
export function applyTagRenameToMarkdown(
  oldTagPath: string,
  newTagPath: string,
  markdown: string
): string {
  // escape special regex chars in the tag path (handles slashes, underscores, etc.)
  const escaped = oldTagPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // match #oldTagPath followed by "/" (child tag) or a non-word/non-slash char
  const regex = new RegExp(`#(${escaped})(?=/|(?![a-zA-Z0-9_/]))`, 'g');
  return markdown.replace(regex, `#${newTagPath}`);
}

/**
 * Walk a block tree and apply the tag rename to every block's markdown.
 * Returns only the blocks that actually changed (with updated markdown).
 */
export function collectChangedBlocks(
  blocks: CraftBlock[],
  oldTagPath: string,
  newTagPath: string
): Array<{ id: string; markdown: string }> {
  const changed: Array<{ id: string; markdown: string }> = [];

  function walk(block: CraftBlock) {
    if (block.markdown) {
      const updated = applyTagRenameToMarkdown(oldTagPath, newTagPath, block.markdown);
      if (updated !== block.markdown) {
        changed.push({ id: block.id, markdown: updated });
      }
    }
    if (block.content) {
      for (const child of block.content) {
        walk(child);
      }
    }
  }

  for (const block of blocks) {
    walk(block);
  }

  return changed;
}

export interface TagRenameProgress {
  current: number;
  total: number;
  message: string;
}

export interface TagRenameResult {
  updatedDocumentCount: number;
  updatedBlockCount: number;
  errors: Array<{ documentId: string; error: string }>;
}

const FETCH_CONCURRENCY = 5;
const BATCH_SIZE = 200;

/**
 * Execute the tag rename across all affected documents.
 *
 * Phase 0 — search fallback: also queries the API to catch any documents tagged
 *   after the last graph build. Results are unioned with the provided documentIds.
 * Phase A — parallel fetch: fetches all document blocks concurrently (5 workers).
 * Phase B — compute: collects all changed blocks across all documents.
 * Phase C — batched PUT: sends all updates in a single call (chunked at 200 blocks).
 */
export async function executeTagRename(
  fetcher: CraftGraphFetcher,
  oldTagPath: string,
  newTagPath: string,
  documentIds: string[],
  onProgress: (progress: TagRenameProgress) => void,
  signal?: AbortSignal
): Promise<TagRenameResult> {
  let updatedDocumentCount = 0;
  let updatedBlockCount = 0;
  const errors: Array<{ documentId: string; error: string }> = [];

  // Phase 0: search fallback — catches docs added after the last graph build
  onProgress({ current: 0, total: 0, message: 'Checking for recently tagged documents…' });
  const searchIds = await fetcher.findDocumentsWithTag(oldTagPath, signal);
  if (signal?.aborted) return { updatedDocumentCount, updatedBlockCount, errors };

  const allDocIds = [...new Set([...documentIds, ...searchIds])];
  const total = allDocIds.length;

  if (total === 0) return { updatedDocumentCount, updatedBlockCount, errors };

  // Phase A: parallel block fetch
  const changedBlocksMap = new Map<string, Array<{ id: string; markdown: string }>>();
  let fetchCompleted = 0;
  const queue = [...allDocIds];

  const worker = async () => {
    while (queue.length > 0) {
      if (signal?.aborted) break;
      const docId = queue.shift();
      if (!docId) break;

      try {
        const blocks = await fetcher.fetchBlocks(docId, -1, signal);
        if (signal?.aborted) break;
        const changed = collectChangedBlocks(blocks, oldTagPath, newTagPath);
        changedBlocksMap.set(docId, changed);
      } catch (err) {
        if (signal?.aborted) break;
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[TagRename] Failed to fetch doc ${docId}:`, message);
        errors.push({ documentId: docId, error: message });
      }

      fetchCompleted++;
      onProgress({
        current: fetchCompleted,
        total,
        message: `Loading block content for document ${fetchCompleted} of ${total}…`,
      });
    }
  };

  await Promise.all(
    Array(Math.min(FETCH_CONCURRENCY, allDocIds.length))
      .fill(0)
      .map(() => worker())
  );

  if (signal?.aborted) return { updatedDocumentCount, updatedBlockCount, errors };

  // Phase B: collect all changed blocks
  const allChangedBlocks: Array<{ id: string; markdown: string }> = [];
  for (const changed of changedBlocksMap.values()) {
    if (changed.length > 0) {
      allChangedBlocks.push(...changed);
      updatedDocumentCount++;
    }
  }

  if (allChangedBlocks.length === 0) {
    return { updatedDocumentCount: 0, updatedBlockCount: 0, errors };
  }

  // Phase C: batched PUT — chunk at BATCH_SIZE to avoid payload limits
  const batchCount = Math.ceil(allChangedBlocks.length / BATCH_SIZE);

  for (let i = 0; i < allChangedBlocks.length; i += BATCH_SIZE) {
    if (signal?.aborted) break;
    const batch = allChangedBlocks.slice(i, i + BATCH_SIZE);
    const batchIndex = Math.floor(i / BATCH_SIZE) + 1;

    onProgress({
      current: batchIndex,
      total: batchCount,
      message: `Saving changes (batch ${batchIndex}/${batchCount}, ${allChangedBlocks.length} blocks total)…`,
    });

    try {
      await fetcher.updateBlocks(batch, signal);
      updatedBlockCount += batch.length;
    } catch (err) {
      if (signal?.aborted) break;
      const message = err instanceof Error ? err.message : String(err);
      console.error('[TagRename] Failed to update blocks batch:', message);
      errors.push({ documentId: 'batch', error: message });
    }
  }

  return { updatedDocumentCount, updatedBlockCount, errors };
}
