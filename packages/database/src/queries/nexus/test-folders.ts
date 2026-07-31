// @ts-nocheck: nexus_test_folders and nexus_tests.folder_id are not in
// database.generated.ts yet. Regenerate once 20260812090000 is on both envs.
/**
 * The test library's folder tree.
 *
 * One table holds two trees, keyed by owner_scope: the shared staff library
 * and one private tree per student. Every function here takes the scope so a
 * caller cannot accidentally read across the boundary, and the student
 * variants always require an ownerId.
 *
 * A test lives in exactly one folder. folder_id NULL is "Unfiled", a real
 * bucket the hub shows rather than a hole tests fall into.
 */
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type {
  NexusTestFolder,
  NexusTestFolderCrumb,
  NexusTestFolderNode,
  NexusTestFolderScope,
} from '../../types';

const FOLDERS = 'nexus_test_folders';
const TESTS = 'nexus_tests';

/** Deepest tree we will build or accept a move into. Keeps breadcrumbs readable on a phone. */
export const MAX_TEST_FOLDER_DEPTH = 4;

export interface TestFolderScopeRef {
  scope: NexusTestFolderScope;
  /** Required when scope is 'student', ignored otherwise. */
  ownerId?: string | null;
}

function assertScope(ref: TestFolderScopeRef): void {
  if (ref.scope === 'student' && !ref.ownerId) {
    throw new Error('A student folder tree needs an ownerId');
  }
}

function applyScope(query: any, ref: TestFolderScopeRef) {
  const q = query.eq('owner_scope', ref.scope);
  // The staff tree is shared, so owner_id is null there. Filtering on it
  // anyway would silently return nothing.
  return ref.scope === 'student' ? q.eq('owner_id', ref.ownerId) : q.is('owner_id', null);
}

/** Flat list of live folders in one tree, ordered for stable display. */
export async function listTestFolders(
  ref: TestFolderScopeRef,
  client?: TypedSupabaseClient,
): Promise<NexusTestFolder[]> {
  assertScope(ref);
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await applyScope(
    supabase.from(FOLDERS).select('*').eq('is_deleted', false),
    ref,
  )
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data || []) as NexusTestFolder[];
}

/**
 * Nest a flat folder list. Cycle safe by construction: a node is only ever
 * attached to a parent already present in the map, and a row whose parent is
 * missing (deleted mid-read, or a cycle) surfaces at the root rather than
 * vanishing. Modelled on buildQBTagTree in qb-tags.ts.
 */
export function buildTestFolderTree(
  rows: NexusTestFolder[],
  counts?: Map<string, number>,
): NexusTestFolderNode[] {
  const byId = new Map<string, NexusTestFolderNode>();
  for (const row of rows) {
    byId.set(row.id, { ...row, children: [], test_count: counts?.get(row.id) ?? 0 });
  }
  const roots: NexusTestFolderNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** How many live tests sit directly in each folder of a tree. */
export async function getFolderTestCounts(
  ref: TestFolderScopeRef,
  client?: TypedSupabaseClient,
): Promise<Map<string, number>> {
  assertScope(ref);
  const supabase = client || getSupabaseAdminClient();
  const folders = await listTestFolders(ref, supabase);
  const counts = new Map<string, number>();
  if (folders.length === 0) return counts;

  const { data, error } = await supabase
    .from(TESTS)
    .select('folder_id')
    .eq('is_active', true)
    .in('folder_id', folders.map((f) => f.id));
  if (error) throw error;
  for (const row of data || []) {
    if (!row.folder_id) continue;
    counts.set(row.folder_id, (counts.get(row.folder_id) || 0) + 1);
  }
  return counts;
}

/** The tree plus per-folder counts, which is what every UI actually wants. */
export async function listTestFolderTree(
  ref: TestFolderScopeRef,
  client?: TypedSupabaseClient,
): Promise<{ tree: NexusTestFolderNode[]; unfiled_count: number }> {
  assertScope(ref);
  const supabase = client || getSupabaseAdminClient();
  const [rows, counts] = await Promise.all([
    listTestFolders(ref, supabase),
    getFolderTestCounts(ref, supabase),
  ]);

  // Unfiled is scoped the same way the folders are, otherwise a student would
  // see every teacher's stray test in their own "Unfiled".
  let unfiledQuery = supabase
    .from(TESTS)
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)
    .is('folder_id', null);
  unfiledQuery =
    ref.scope === 'student'
      ? unfiledQuery.eq('created_by_student', ref.ownerId)
      : unfiledQuery.is('created_by_student', null);
  const { count, error } = await unfiledQuery;
  if (error) throw error;

  return { tree: buildTestFolderTree(rows, counts), unfiled_count: count || 0 };
}

export async function getTestFolderById(
  folderId: string,
  client?: TypedSupabaseClient,
): Promise<NexusTestFolder | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data } = await supabase
    .from(FOLDERS)
    .select('*')
    .eq('id', folderId)
    .eq('is_deleted', false)
    .maybeSingle();
  return (data as NexusTestFolder) || null;
}

/** Ancestor path, oldest first, for the breadcrumb above a folder's tests. */
export async function getTestFolderBreadcrumb(
  folderId: string,
  client?: TypedSupabaseClient,
): Promise<NexusTestFolderCrumb[]> {
  const supabase = client || getSupabaseAdminClient();
  const crumbs: NexusTestFolderCrumb[] = [];
  let cursor: string | null = folderId;
  // Bounded by the depth cap plus slack. A corrupted parent chain must not
  // spin here, and returning a short path is better than hanging the request.
  for (let hop = 0; cursor && hop <= MAX_TEST_FOLDER_DEPTH + 2; hop += 1) {
    const { data } = await supabase
      .from(FOLDERS)
      .select('id, name, parent_id')
      .eq('id', cursor)
      .maybeSingle();
    if (!data) break;
    crumbs.unshift({ id: data.id, name: data.name });
    cursor = data.parent_id;
  }
  return crumbs;
}

async function testFolderDepth(
  parentId: string | null,
  client: TypedSupabaseClient,
): Promise<number> {
  if (!parentId) return 0;
  const crumbs = await getTestFolderBreadcrumb(parentId, client);
  return crumbs.length;
}

export interface CreateTestFolderInput extends TestFolderScopeRef {
  name: string;
  parentId?: string | null;
  description?: string | null;
  createdBy?: string | null;
}

export async function createTestFolder(
  input: CreateTestFolderInput,
  client?: TypedSupabaseClient,
): Promise<NexusTestFolder> {
  assertScope(input);
  const supabase = client || getSupabaseAdminClient();
  const name = (input.name || '').trim();
  if (!name) throw new Error('A folder needs a name');

  if (input.parentId) {
    const parent = await getTestFolderById(input.parentId, supabase);
    if (!parent) throw new Error('FOLDER_PARENT_NOT_FOUND');
    // A parent from the other tree would put a staff folder inside a student's
    // private tree, which the scope filters would then never find again.
    if (parent.owner_scope !== input.scope || (parent.owner_id ?? null) !== (input.ownerId ?? null)) {
      throw new Error('FOLDER_SCOPE_MISMATCH');
    }
    if ((await testFolderDepth(input.parentId, supabase)) >= MAX_TEST_FOLDER_DEPTH) {
      throw new Error('FOLDER_TOO_DEEP');
    }
  }

  const { data, error } = await supabase
    .from(FOLDERS)
    .insert({
      name,
      description: input.description ?? null,
      parent_id: input.parentId ?? null,
      owner_scope: input.scope,
      owner_id: input.scope === 'student' ? input.ownerId : null,
      created_by: input.createdBy ?? null,
      sort_order: 0,
    })
    .select('*')
    .single();
  // The sibling-name unique index is a real user situation ("Foundation"
  // typed twice), not a bug, so it gets a code the route can turn into a
  // sentence rather than a 500.
  if (error) throw error.code === '23505' ? new Error('FOLDER_NAME_TAKEN') : error;
  return data as NexusTestFolder;
}

/**
 * Find a folder by name under a parent, or create it. Lets the import wizard
 * accept the AI's "Foundation / History of Architecture" suggestion and
 * materialise the whole path without the teacher pre-building it.
 */
export async function findOrCreateTestFolderPath(
  ref: TestFolderScopeRef,
  path: string[],
  createdBy?: string | null,
  client?: TypedSupabaseClient,
): Promise<NexusTestFolder | null> {
  assertScope(ref);
  const supabase = client || getSupabaseAdminClient();
  const segments = path.map((s) => (s || '').trim()).filter(Boolean).slice(0, MAX_TEST_FOLDER_DEPTH);
  if (segments.length === 0) return null;

  let parentId: string | null = null;
  let current: NexusTestFolder | null = null;
  for (const segment of segments) {
    let query = applyScope(
      supabase.from(FOLDERS).select('*').eq('is_deleted', false).ilike('name', segment),
      ref,
    );
    // A root segment matches rows with no parent, a nested one matches its
    // parent's id. PostgREST needs .is() for null and .eq() for a value.
    query = parentId === null ? query.is('parent_id', null) : query.eq('parent_id', parentId);
    const { data: found } = await query.maybeSingle();

    current =
      (found as NexusTestFolder | null) ||
      (await createTestFolder({ ...ref, name: segment, parentId, createdBy }, supabase));
    parentId = current.id;
  }
  return current;
}

export async function renameTestFolder(
  folderId: string,
  name: string,
  client?: TypedSupabaseClient,
): Promise<NexusTestFolder> {
  const supabase = client || getSupabaseAdminClient();
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('A folder needs a name');
  const { data, error } = await supabase
    .from(FOLDERS)
    .update({ name: trimmed, updated_at: new Date().toISOString() })
    .eq('id', folderId)
    .select('*')
    .single();
  if (error) throw error.code === '23505' ? new Error('FOLDER_NAME_TAKEN') : error;
  return data as NexusTestFolder;
}

/** Move a folder under a new parent (null for the root). */
export async function moveTestFolder(
  folderId: string,
  newParentId: string | null,
  client?: TypedSupabaseClient,
): Promise<NexusTestFolder> {
  const supabase = client || getSupabaseAdminClient();
  const folder = await getTestFolderById(folderId, supabase);
  if (!folder) throw new Error('FOLDER_NOT_FOUND');

  if (newParentId) {
    if (newParentId === folderId) throw new Error('FOLDER_CYCLE');
    const parent = await getTestFolderById(newParentId, supabase);
    if (!parent) throw new Error('FOLDER_PARENT_NOT_FOUND');
    if (parent.owner_scope !== folder.owner_scope || (parent.owner_id ?? null) !== (folder.owner_id ?? null)) {
      throw new Error('FOLDER_SCOPE_MISMATCH');
    }
    // Dropping a folder onto its own descendant detaches the whole subtree
    // from the root, and ON DELETE CASCADE would then take real work with it.
    const parentPath = await getTestFolderBreadcrumb(newParentId, supabase);
    if (parentPath.some((c) => c.id === folderId)) throw new Error('FOLDER_CYCLE');
    if (parentPath.length >= MAX_TEST_FOLDER_DEPTH) throw new Error('FOLDER_TOO_DEEP');
  }

  const { data, error } = await supabase
    .from(FOLDERS)
    .update({ parent_id: newParentId, updated_at: new Date().toISOString() })
    .eq('id', folderId)
    .select('*')
    .single();
  if (error) throw error.code === '23505' ? new Error('FOLDER_NAME_TAKEN') : error;
  return data as NexusTestFolder;
}

/**
 * Soft-delete a folder and its descendants. Tests are never deleted: they are
 * unfiled first, so a mis-click costs a teacher a re-file and never a paper
 * students have already sat.
 */
export async function softDeleteTestFolder(
  folderId: string,
  client?: TypedSupabaseClient,
): Promise<{ unfiled: number; folders: number }> {
  const supabase = client || getSupabaseAdminClient();
  const folder = await getTestFolderById(folderId, supabase);
  if (!folder) throw new Error('FOLDER_NOT_FOUND');

  const ref: TestFolderScopeRef = { scope: folder.owner_scope, ownerId: folder.owner_id };
  const all = await listTestFolders(ref, supabase);
  const childrenOf = new Map<string, string[]>();
  for (const f of all) {
    if (!f.parent_id) continue;
    childrenOf.set(f.parent_id, [...(childrenOf.get(f.parent_id) || []), f.id]);
  }
  const doomed: string[] = [];
  const stack = [folderId];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (doomed.includes(id)) continue;
    doomed.push(id);
    stack.push(...(childrenOf.get(id) || []));
  }

  const { data: freed, error: testErr } = await supabase
    .from(TESTS)
    .update({ folder_id: null })
    .in('folder_id', doomed)
    .select('id');
  if (testErr) throw testErr;

  const { error } = await supabase
    .from(FOLDERS)
    .update({ is_deleted: true, updated_at: new Date().toISOString() })
    .in('id', doomed);
  if (error) throw error;

  return { unfiled: (freed || []).length, folders: doomed.length };
}

/** File one or more tests into a folder. Pass null to unfile them. */
export async function moveTestsToFolder(
  testIds: string[],
  folderId: string | null,
  client?: TypedSupabaseClient,
): Promise<number> {
  const supabase = client || getSupabaseAdminClient();
  const ids = [...new Set(testIds)].filter(Boolean);
  if (ids.length === 0) return 0;
  if (folderId) {
    const folder = await getTestFolderById(folderId, supabase);
    if (!folder) throw new Error('FOLDER_NOT_FOUND');
  }
  const { data, error } = await supabase
    .from(TESTS)
    .update({ folder_id: folderId })
    .in('id', ids)
    .select('id');
  if (error) throw error;
  return (data || []).length;
}
