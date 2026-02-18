/**
 * CLI test script for the tag rename pipeline.
 *
 * Usage:
 *   bun scripts/test-tag-rename.ts <tagPath> [--execute]
 *
 * Requires API_URL and API_KEY in .env (Bun auto-loads).
 *
 * Dry-run: prints all documents and blocks that would change.
 * --execute: performs the rename via Craft API PUT /blocks.
 */

import { computeTagRenameMap, applyTagRenameToMarkdown } from '../lib/graph/tag-rename';
import type { GraphData, GraphNode, GraphLink, CraftBlock } from '../lib/graph/types';

const API_URL = process.env.API_URL;
const API_KEY = process.env.API_KEY;

// parse args
const args = process.argv.slice(2);
const tagPath = args.find(a => !a.startsWith('--'));
const doExecute = args.includes('--execute');

if (!tagPath) {
  console.error('Usage: bun scripts/test-tag-rename.ts <tagPath> [--execute]');
  process.exit(1);
}
if (!API_URL || !API_KEY) {
  console.error('Missing API_URL or API_KEY in environment. Add them to .env');
  process.exit(1);
}

// ---- direct Craft API client (no browser proxy) ----

async function craftGet<T>(endpoint: string, params: Record<string, string> = {}, retries = 3): Promise<T> {
  const url = new URL(API_URL + endpoint);
  for (const [k, v] of Object.entries(params)) url.searchParams.append(k, v);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    if (res.status === 429 && retries > 0) {
      const retryAfter = res.headers.get('Retry-After');
      const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : 10000;
      console.log(`   rate limited, waiting ${delay / 1000}s...`);
      await new Promise(r => setTimeout(r, delay));
      return craftGet<T>(endpoint, params, retries - 1);
    }
    throw new Error(`GET ${endpoint} failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function craftPut<T>(endpoint: string, body: unknown): Promise<T> {
  const res = await fetch(API_URL + endpoint, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`PUT ${endpoint} failed: ${res.status} ${res.statusText}`);
  return res.json();
}

// ---- graph helpers ----

const HASHTAG_REGEX = /#([a-zA-Z0-9_]+(?:\/[a-zA-Z0-9_]+)*)/g;

function extractHashtags(markdown: string): string[] {
  const tags: string[] = [];
  let match;
  HASHTAG_REGEX.lastIndex = 0;
  while ((match = HASHTAG_REGEX.exec(markdown)) !== null) {
    const full = match[1];
    tags.push(full);
    if (full.includes('/')) {
      const parts = full.split('/');
      for (let i = 1; i < parts.length; i++) {
        const parent = parts.slice(0, i).join('/');
        if (!tags.includes(parent)) tags.push(parent);
      }
    }
  }
  return [...new Set(tags)];
}

function extractTagsFromBlock(block: CraftBlock): string[] {
  const tags: string[] = [];
  if (block.markdown) tags.push(...extractHashtags(block.markdown));
  if (block.content) {
    for (const child of block.content) tags.push(...extractTagsFromBlock(child));
  }
  return [...new Set(tags)];
}

async function fetchAllDocuments() {
  const res = await craftGet<any>('/documents', { fetchMetadata: 'true' });
  const docs = res.items || res.documents || res;
  return (Array.isArray(docs) ? docs : []).filter((d: any) => !d.deleted);
}

async function fetchBlocks(docId: string): Promise<CraftBlock[]> {
  const res = await craftGet<any>('/blocks', { id: docId, maxDepth: '-1' });
  if (Array.isArray(res)) return res;
  if (res?.id && res?.type) return [res];
  if (Array.isArray(res?.blocks)) return res.blocks;
  return [];
}

function collectChangedBlocks(
  blocks: CraftBlock[],
  oldPath: string,
  newPath: string
): Array<{ id: string; markdown: string }> {
  const changed: Array<{ id: string; markdown: string }> = [];
  function walk(b: CraftBlock) {
    if (b.markdown) {
      const updated = applyTagRenameToMarkdown(oldPath, newPath, b.markdown);
      if (updated !== b.markdown) changed.push({ id: b.id, markdown: updated });
    }
    if (b.content) b.content.forEach(walk);
  }
  blocks.forEach(walk);
  return changed;
}

// ---- build minimal graph (docs + tag nodes + links) ----

async function buildTagGraph(docs: any[]): Promise<GraphData> {
  const nodesMap = new Map<string, GraphNode>();
  const linksMap = new Map<string, Set<string>>();
  const tagToDocsMap = new Map<string, Set<string>>();

  for (const doc of docs) {
    nodesMap.set(doc.id, {
      id: doc.id,
      title: doc.title || 'Untitled',
      type: 'document',
      linkCount: 0,
    });
  }

  const CONCURRENCY = 5;
  const queue = [...docs];
  let done = 0;

  const worker = async () => {
    while (queue.length > 0) {
      const doc = queue.shift();
      if (!doc) break;
      try {
        const blocks = await fetchBlocks(doc.id);
        const tags = new Set<string>();
        for (const b of blocks) extractTagsFromBlock(b).forEach(t => tags.add(t));
        for (const tag of tags) {
          if (!tagToDocsMap.has(tag)) tagToDocsMap.set(tag, new Set());
          tagToDocsMap.get(tag)!.add(doc.id);
        }
      } catch {
        // skip failed docs
      }
      done++;
      process.stdout.write(`\r  loading blocks... ${done}/${docs.length}`);
    }
  };

  await Promise.all(Array(Math.min(CONCURRENCY, docs.length)).fill(0).map(() => worker()));
  process.stdout.write('\n');

  // create tag nodes + links
  for (const [tag, docIds] of tagToDocsMap) {
    const tagId = `tag:${tag}`;
    nodesMap.set(tagId, {
      id: tagId,
      title: `#${tag}`,
      type: 'tag',
      linkCount: 0,
      color: '#34d399',
      nodeSize: 2,
      metadata: { tagPath: tag, isNestedTag: tag.includes('/') },
    });
    if (!linksMap.has(tagId)) linksMap.set(tagId, new Set());
    for (const docId of docIds) linksMap.get(tagId)!.add(docId);
  }

  const links: GraphLink[] = [];
  for (const [source, targets] of linksMap) {
    for (const target of targets) {
      if (nodesMap.has(target)) links.push({ source, target });
    }
  }

  return { nodes: Array.from(nodesMap.values()), links };
}

// ---- main ----

async function main() {
  const newPath = `${tagPath}_renamed`; // placeholder for dry-run display
  console.log(`\nTag rename test: #${tagPath} → #${newPath} (dry-run: ${!doExecute})\n`);

  console.log('1. Fetching documents...');
  const docs = await fetchAllDocuments();
  console.log(`   Found ${docs.length} documents\n`);

  console.log('2. Building tag graph...');
  const graphData = await buildTagGraph(docs);
  const tagNode = graphData.nodes.find(n => n.type === 'tag' && n.metadata?.tagPath === tagPath);

  if (!tagNode) {
    console.log(`   Tag #${tagPath} not found in graph.`);
    console.log('   (The tag may not exist in any document, or graph build may have failed.)');
    process.exit(0);
  }

  const renameMap = computeTagRenameMap(tagPath, newPath, graphData);
  const affectedTagIds = new Set(Array.from(renameMap.keys()).map(p => `tag:${p}`));

  const affectedDocIds = new Set<string>();
  for (const link of graphData.links) {
    const src = typeof link.source === 'object' ? (link.source as any).id : link.source;
    const tgt = typeof link.target === 'object' ? (link.target as any).id : link.target;
    if (affectedTagIds.has(src)) affectedDocIds.add(tgt);
  }

  console.log(`\n3. Tag node found: ${tagNode.title}`);
  console.log(`   Affected tag paths: ${Array.from(renameMap.keys()).join(', ')}`);
  console.log(`   Affected documents (from graph): ${affectedDocIds.size}\n`);

  if (affectedDocIds.size === 0) {
    console.log('   No documents to update.');
    process.exit(0);
  }

  console.log('4. Fetching blocks and computing changes...');
  const docTitles = new Map(docs.map((d: any) => [d.id, d.title || 'Untitled']));
  const allChanges: Array<{ docId: string; docTitle: string; blocks: Array<{ id: string; old: string; new: string }> }> = [];

  for (const docId of affectedDocIds) {
    const blocks = await fetchBlocks(docId);
    const changedBlocks: Array<{ id: string; old: string; new: string }> = [];

    for (const tagPath of renameMap.keys()) {
      const newTagPath = renameMap.get(tagPath)!;
      const changed = collectChangedBlocks(blocks, tagPath, newTagPath);
      for (const c of changed) {
        // find original markdown for display
        const findOriginal = (bs: CraftBlock[]): string => {
          for (const b of bs) {
            if (b.id === c.id && b.markdown) return b.markdown;
            if (b.content) {
              const found = findOriginal(b.content);
              if (found) return found;
            }
          }
          return '';
        };
        changedBlocks.push({ id: c.id, old: findOriginal(blocks), new: c.markdown });
      }
    }

    if (changedBlocks.length > 0) {
      allChanges.push({ docId, docTitle: docTitles.get(docId) || docId, blocks: changedBlocks });
    }
  }

  console.log(`\n5. Summary:\n`);
  console.log(`   Documents with changes: ${allChanges.length}`);
  console.log(`   Total blocks to modify: ${allChanges.reduce((n, d) => n + d.blocks.length, 0)}\n`);

  for (const doc of allChanges) {
    console.log(`   "${doc.docTitle}" (${doc.blocks.length} block(s)):`);
    for (const b of doc.blocks) {
      // show a trimmed diff
      const oldSnip = b.old.length > 80 ? b.old.slice(0, 77) + '...' : b.old;
      const newSnip = b.new.length > 80 ? b.new.slice(0, 77) + '...' : b.new;
      console.log(`     - ${oldSnip}`);
      console.log(`     + ${newSnip}`);
    }
    console.log();
  }

  if (!doExecute) {
    console.log('Dry run complete. Pass --execute to apply changes.\n');
    return;
  }

  // flatten all changed blocks across all docs (note: actual newPath values used)
  const allBlocks: Array<{ id: string; markdown: string }> = [];
  for (const docId of affectedDocIds) {
    const blocks = await fetchBlocks(docId);
    for (const [oldTag, newTag] of renameMap) {
      allBlocks.push(...collectChangedBlocks(blocks, oldTag, newTag));
    }
  }

  // deduplicate (a block might match multiple tag renames)
  const blockMap = new Map<string, string>();
  for (const b of allBlocks) blockMap.set(b.id, b.markdown);
  const finalBlocks = Array.from(blockMap.entries()).map(([id, markdown]) => ({ id, markdown }));

  console.log(`Executing: updating ${finalBlocks.length} blocks via PUT /blocks...`);
  const BATCH_SIZE = 200;
  for (let i = 0; i < finalBlocks.length; i += BATCH_SIZE) {
    const batch = finalBlocks.slice(i, i + BATCH_SIZE);
    await craftPut('/blocks', { blocks: batch });
    console.log(`  batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(finalBlocks.length / BATCH_SIZE)} done`);
  }

  console.log(`\nDone. ${allChanges.length} documents updated.\n`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
