/**
 * The breadcrumb trail for a study-materials folder, without a query per level.
 *
 * getBreadcrumb() in @neram/database walks the parent chain one row at a time, so a
 * folder four levels deep costs four serial round trips, and the folders route awaited
 * it alone at the very end of the request. From India that is most of a second spent
 * fetching at most a handful of short strings.
 *
 * The whole folder tree is small (tens of rows, not thousands) and changes only when a
 * teacher renames or moves something, so it is cheaper to hold the shape of it for a
 * minute and walk the chain in memory.
 *
 * SECURITY: the cached projection is `id, parent_id, name` and nothing else. target_exams
 * and target_programs are deliberately absent, so this cache can never be the thing that
 * decides whether a student may see a folder. That decision stays on the freshly-read row
 * in the route. The worst this cache can do is show a renamed folder's old name, for at
 * most a minute.
 *
 * Deliberately nexus-local rather than a change to the shared queries package: editing
 * packages/database rebuilds all four apps, and no other caller needs this.
 */

import { getSupabaseAdminClient } from '@neram/database';
import { TtlCache } from '@/lib/ttl-cache';

const FOLDERS = 'nexus_study_folders';

/**
 * Ceiling on how deep a trail can go. Mirrors the guard in getBreadcrumb: a parent
 * cycle in the data must not hang the request.
 */
const MAX_DEPTH = 50;

/**
 * Matches the identity and user-row caches elsewhere in the app. A rename takes at
 * most this long to show up in a breadcrumb, which is the entire exposure.
 */
const TREE_TTL_MS = 60_000;

const TREE_KEY = 'tree';

interface FolderNode {
  id: string;
  parent_id: string | null;
  name: string;
}

/** One entry, holding the whole tree. maxEntries 1 keeps that explicit. */
const treeCache = new TtlCache<Map<string, FolderNode>>(TREE_TTL_MS, 1);

/** Test seam. Resets the module-level tree between cases. */
export function __clearBreadcrumbCache(): void {
  treeCache.clear();
}

/**
 * Deliberately no `is_deleted` filter: getBreadcrumb has never had one, and adding it
 * would silently drop a deleted ancestor out of the middle of a trail rather than
 * showing the path the file actually sits at.
 */
async function loadTree(): Promise<Map<string, FolderNode>> {
  const cached = treeCache.get(TREE_KEY);
  if (cached) return cached;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await (supabase.from(FOLDERS as any) as any)
    .select('id, parent_id, name')
    .limit(5000);
  if (error) throw error;

  const tree = new Map<string, FolderNode>();
  for (const row of (data || []) as FolderNode[]) tree.set(row.id, row);
  treeCache.set(TREE_KEY, tree);
  return tree;
}

/**
 * Fallback for a folder the cached tree does not know about: one created since the
 * tree was loaded, or beyond the row limit above. Rare, and still cheaper than the
 * per-level walk it replaces.
 */
async function fetchNode(id: string): Promise<FolderNode | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await (supabase.from(FOLDERS as any) as any)
    .select('id, parent_id, name')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as FolderNode) || null;
}

/**
 * Root-first trail of { id, name } for a folder, or [] for the root itself.
 * Drop-in replacement for getBreadcrumb(folderId).
 */
export async function buildBreadcrumb(
  folderId: string | null,
): Promise<{ id: string; name: string }[]> {
  if (!folderId) return [];

  const tree = await loadTree();
  const trail: { id: string; name: string }[] = [];
  // Belt and braces with MAX_DEPTH: a cycle is corrupt data either way, but stopping at
  // the repeat returns the real prefix instead of fifty rows of the loop.
  const seen = new Set<string>();
  let currentId: string | null = folderId;

  for (let i = 0; i < MAX_DEPTH && currentId; i++) {
    if (seen.has(currentId)) break;
    seen.add(currentId);

    let node = tree.get(currentId);
    if (!node) {
      const fetched = await fetchNode(currentId);
      if (!fetched) break;
      node = fetched;
      // Memoise the miss so a sibling lookup in the same window does not repeat it.
      tree.set(node.id, node);
    }

    trail.unshift({ id: node.id, name: node.name });
    currentId = node.parent_id;
  }

  return trail;
}
