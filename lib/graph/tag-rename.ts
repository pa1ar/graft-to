/**
 * Tag rename service.
 * Handles computing the scope of a tag rename and executing it via Craft API.
 */

import type { GraphData, CraftBlock } from './types';
import type { CraftGraphFetcher } from './fetcher';

/** HTML tags or multi-block content that Craft's PUT endpoint rejects */
const HTML_TAG_REGEX = /<\/?[a-zA-Z][^>]*>/;
// craft splits blocks on more than just \n\n — headings, lists, blockquotes,
// code fences, and horizontal rules after a newline all produce multi-block output
const MULTI_BLOCK_REGEX = /\r?\n\r?\n|\n(?:#|[-*+] |\d+\. |> |```|---|___|\*\*\*)/;

/**
 * Check if a block's markdown is safe to send back via PUT.
 * Craft's GET can return HTML tags (<span>, etc.) and multi-block content
 * that its own PUT endpoint rejects with VALIDATION_ERROR or MARKDOWN_PARSING_ERROR.
 */
export function isBlockMarkdownSafeForPut(markdown: string): boolean {
  return !HTML_TAG_REGEX.test(markdown) && !MULTI_BLOCK_REGEX.test(markdown);
}

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
  // skip targets that are themselves tag nodes (parent→child hierarchy links)
  const docIds = new Set<string>();
  for (const link of graphData.links) {
    const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
    const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;
    if (affectedTagIds.has(sourceId) && !targetId.startsWith('tag:')) {
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

export interface CollectChangedBlocksResult {
  changed: Array<{ id: string; markdown: string }>;
  /** blocks where tag matched but updated markdown is unsafe for PUT */
  skipped: Array<{ id: string; reason: string }>;
}

/**
 * Walk a block tree and apply the tag rename to every block's markdown.
 * Returns changed blocks (safe for PUT) and skipped blocks (tag matched but
 * updated markdown contains HTML or multi-block content that Craft rejects).
 */
export function collectChangedBlocks(
  blocks: CraftBlock[],
  oldTagPath: string,
  newTagPath: string
): CollectChangedBlocksResult {
  const changed: Array<{ id: string; markdown: string }> = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  function walk(block: CraftBlock) {
    if (block.markdown) {
      const updated = applyTagRenameToMarkdown(oldTagPath, newTagPath, block.markdown);
      if (updated !== block.markdown) {
        if (isBlockMarkdownSafeForPut(updated)) {
          changed.push({ id: block.id, markdown: updated });
        } else {
          const reason = HTML_TAG_REGEX.test(updated) ? 'contains HTML' : 'multi-block content';
          skipped.push({ id: block.id, reason });
        }
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

  return { changed, skipped };
}

/**
 * Patch graph data in-memory after a tag rename. Pure function — no side effects.
 * Returns patched GraphData, or null if a target tag node already exists (collision).
 */
export function patchGraphDataForTagRename(
  graphData: GraphData,
  renameMap: Map<string, string>
): GraphData | null {
  if (renameMap.size === 0) return { ...graphData, nodes: [...graphData.nodes], links: [...graphData.links] };

  // build old tag node ID → new tag node ID mapping
  const idMap = new Map<string, string>();
  for (const [oldPath, newPath] of renameMap) {
    idMap.set(`tag:${oldPath}`, `tag:${newPath}`);
  }

  // collision check: if any target tag already exists as a separate node, bail
  const existingIds = new Set(graphData.nodes.map(n => n.id));
  for (const [oldId, newId] of idMap) {
    if (oldId !== newId && existingIds.has(newId)) {
      return null;
    }
  }

  // patch links
  const links = graphData.links.map(link => {
    const src = typeof link.source === 'object' ? (link.source as any).id : link.source;
    const tgt = typeof link.target === 'object' ? (link.target as any).id : link.target;
    const newSrc = idMap.get(src) ?? src;
    const newTgt = idMap.get(tgt) ?? tgt;
    return newSrc === src && newTgt === tgt ? link : { source: newSrc, target: newTgt };
  });

  // recompute linkCounts from patched links
  const linkCounts = new Map<string, number>();
  for (const link of links) {
    const src = typeof link.source === 'object' ? (link.source as any).id : link.source;
    const tgt = typeof link.target === 'object' ? (link.target as any).id : link.target;
    linkCounts.set(src, (linkCounts.get(src) ?? 0) + 1);
    linkCounts.set(tgt, (linkCounts.get(tgt) ?? 0) + 1);
  }

  // patch nodes
  const nodes = graphData.nodes.map(node => {
    if (node.type === 'tag') {
      const newId = idMap.get(node.id);
      if (!newId) return { ...node, linkCount: linkCounts.get(node.id) ?? node.linkCount };
      const newTagPath = renameMap.get(node.metadata?.tagPath ?? '') ?? node.metadata?.tagPath ?? '';
      return {
        ...node,
        id: newId,
        title: `#${newTagPath}`,
        linkCount: linkCounts.get(newId) ?? node.linkCount,
        metadata: { ...node.metadata, tagPath: newTagPath, isNestedTag: newTagPath.includes('/') },
      };
    }

    // patch linkedFrom references on document/block nodes
    const linkedFrom = node.linkedFrom?.some(id => idMap.has(id))
      ? node.linkedFrom.map(id => idMap.get(id) ?? id)
      : node.linkedFrom;

    return { ...node, linkCount: linkCounts.get(node.id) ?? node.linkCount, linkedFrom };
  });

  return { nodes, links };
}

export interface TagRenameProgress {
  current: number;
  total: number;
  message: string;
}

export interface TagRenameResult {
  /** documents that had blocks with the tag */
  affectedDocumentCount: number;
  /** documents successfully saved via API */
  savedDocumentCount: number;
  /** document IDs successfully saved via API */
  savedDocumentIds: string[];
  /** blocks successfully saved via API */
  savedBlockCount: number;
  /** blocks skipped because their markdown is unsafe for PUT */
  skippedBlockCount: number;
  /** document IDs where ALL changed blocks were skipped (no blocks could be saved) */
  skippedDocumentIds: string[];
  errors: Array<{ documentId: string; error: string }>;
}

const FETCH_CONCURRENCY = 5;
const WRITE_CONCURRENCY = 3;

/**
 * Execute the tag rename across all affected documents.
 *
 * Phase 0 — search: queries API to catch docs tagged after last graph build.
 * Phase A — parallel fetch: fetches all document blocks concurrently.
 * Phase B — per-document PUT: saves each document's changed blocks separately.
 *   Failures are isolated — one doc failing doesn't affect others.
 */
export async function executeTagRename(
  fetcher: CraftGraphFetcher,
  oldTagPath: string,
  newTagPath: string,
  documentIds: string[],
  onProgress: (progress: TagRenameProgress) => void,
  signal?: AbortSignal
): Promise<TagRenameResult> {
  let affectedDocumentCount = 0;
  let savedDocumentCount = 0;
  const savedDocumentIds: string[] = [];
  let savedBlockCount = 0;
  let skippedBlockCount = 0;
  const skippedDocumentIds: string[] = [];
  const errors: Array<{ documentId: string; error: string }> = [];
  const emptyResult = () => ({ affectedDocumentCount, savedDocumentCount, savedDocumentIds, savedBlockCount, skippedBlockCount, skippedDocumentIds, errors });

  // Phase 0: search — catches docs added after the last graph build
  onProgress({ current: 0, total: 0, message: 'Checking for recently tagged documents…' });
  const searchIds = await fetcher.findDocumentsWithTag(oldTagPath, signal);
  if (signal?.aborted) return emptyResult();

  const allDocIds = [...new Set([...documentIds, ...searchIds])];
  const total = allDocIds.length;

  if (total === 0) return emptyResult();

  // Phase A: parallel block fetch + collect changed blocks per document
  const changedBlocksMap = new Map<string, Array<{ id: string; markdown: string }>>();
  let fetchCompleted = 0;
  const fetchQueue = [...allDocIds];

  const fetchWorker = async () => {
    while (fetchQueue.length > 0) {
      if (signal?.aborted) break;
      const docId = fetchQueue.shift();
      if (!docId) break;

      try {
        const blocks = await fetcher.fetchBlocks(docId, -1, signal);
        if (signal?.aborted) break;
        const { changed, skipped } = collectChangedBlocks(blocks, oldTagPath, newTagPath);
        skippedBlockCount += skipped.length;
        if (changed.length > 0) {
          changedBlocksMap.set(docId, changed);
        }
        if (skipped.length > 0 && changed.length === 0) {
          // all matching blocks in this doc were skipped — nothing to save
          skippedDocumentIds.push(docId);
        }
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
      .map(() => fetchWorker())
  );

  if (signal?.aborted) return emptyResult();

  // include both saveable docs and skip-only docs in the count
  affectedDocumentCount = changedBlocksMap.size + skippedDocumentIds.length;

  if (changedBlocksMap.size === 0) {
    return emptyResult();
  }

  // Phase B: per-document PUT — each doc's blocks saved separately
  // failures are isolated: one bad doc doesn't kill others
  const docsToWrite = Array.from(changedBlocksMap.entries());
  let writeCompleted = 0;
  const writeQueue = [...docsToWrite];

  const writeWorker = async () => {
    while (writeQueue.length > 0) {
      if (signal?.aborted) break;
      const entry = writeQueue.shift();
      if (!entry) break;
      const [docId, blocks] = entry;

      try {
        await fetcher.updateBlocks(blocks, signal);
        savedDocumentCount++;
        savedDocumentIds.push(docId);
        savedBlockCount += blocks.length;
      } catch (err) {
        if (signal?.aborted) break;
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[TagRename] Failed to save doc ${docId} (${blocks.length} blocks):`, message);
        errors.push({ documentId: docId, error: message });
      }

      writeCompleted++;
      onProgress({
        current: writeCompleted,
        total: docsToWrite.length,
        message: `Saving document ${writeCompleted} of ${docsToWrite.length}…`,
      });
    }
  };

  await Promise.all(
    Array(Math.min(WRITE_CONCURRENCY, docsToWrite.length))
      .fill(0)
      .map(() => writeWorker())
  );

  return { affectedDocumentCount, savedDocumentCount, savedDocumentIds, savedBlockCount, skippedBlockCount, skippedDocumentIds, errors };
}
