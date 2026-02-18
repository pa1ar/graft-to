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

  // Always include the renamed tag itself even if it's not in the current graph
  if (!renameMap.has(oldTagPath)) {
    renameMap.set(oldTagPath, newTagPath);
  }

  return renameMap;
}

/**
 * Compute the full rename preview: rename map + live document list via Craft API search.
 * The document list is fetched fresh from the API to avoid missing docs that weren't
 * indexed in the current in-memory graph (e.g. due to stale cache or fetch errors).
 */
export async function computeTagRename(
  oldTagPath: string,
  newTagPath: string,
  graphData: GraphData,
  fetcher: CraftGraphFetcher,
  signal?: AbortSignal
): Promise<TagRenamePreview> {
  const renameMap = computeTagRenameMap(oldTagPath, newTagPath, graphData);

  // Search the Craft API live for all documents containing this tag.
  // This covers docs missed by the graph cache.
  const affectedDocumentIds = await fetcher.findDocumentsWithTag(oldTagPath, signal);

  return {
    affectedTagPaths: Array.from(renameMap.keys()),
    renameMap,
    affectedDocumentIds,
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
  // Escape special regex chars in the tag path (handles slashes, underscores, etc.)
  const escaped = oldTagPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match #oldTagPath followed by:
  //   - "/" (child tag continues)
  //   - a non-word, non-slash character (e.g., space, punctuation, end-of-string)
  // The character after the tag is captured and reinserted so we don't consume it.
  const regex = new RegExp(`#(${escaped})(?=/|(?![a-zA-Z0-9_/]))`, 'g');
  return markdown.replace(regex, `#${newTagPath}`);
}

/**
 * Walk a block tree and apply the tag rename to every block's markdown.
 * Returns only the blocks that actually changed (with updated markdown).
 */
function collectChangedBlocks(
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

/**
 * Execute the tag rename across all affected documents.
 * Re-fetches each document's blocks fresh before modifying, to avoid stale data.
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

  const total = documentIds.length;

  for (let i = 0; i < documentIds.length; i++) {
    if (signal?.aborted) break;

    const docId = documentIds[i];
    onProgress({ current: i + 1, total, message: `Updating document ${i + 1} of ${total}…` });

    try {
      // Re-fetch fresh blocks to avoid overwriting concurrent edits
      const blocks = await fetcher.fetchBlocks(docId, -1, signal);
      if (signal?.aborted) break;

      const changedBlocks = collectChangedBlocks(blocks, oldTagPath, newTagPath);
      if (changedBlocks.length === 0) continue;

      await fetcher.updateBlocks(changedBlocks, signal);
      if (signal?.aborted) break;

      updatedDocumentCount++;
      updatedBlockCount += changedBlocks.length;
    } catch (err) {
      if (signal?.aborted) break;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[TagRename] Failed to update doc ${docId}:`, message);
      errors.push({ documentId: docId, error: message });
    }
  }

  return { updatedDocumentCount, updatedBlockCount, errors };
}
