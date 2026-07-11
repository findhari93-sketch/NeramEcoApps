// @ts-nocheck — nexus_study_folders / nexus_study_files not yet in generated Supabase types;
// regenerate with pnpm supabase:gen:types after the migration is applied.
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type {
  NexusStudyFolder,
  NexusStudyFile,
  NexusStudyFileKind,
  NexusStudyFileDTO,
  NexusStudyCommentVisibility,
  NexusStudyCommentAuthorRole,
  NexusStudyFileCommentWithAuthor,
  NexusStudyFeedbackThread,
} from '../../types';

const FOLDERS = 'nexus_study_folders';
const FILES = 'nexus_study_files';
const COMMENTS = 'nexus_study_file_comments';
const READS = 'nexus_study_file_reads';
const FAVORITES = 'nexus_study_file_favorites';
const AUTHOR_JOIN = 'author:users!nexus_study_file_comments_author_id_fkey(id, name, avatar_url)';

/** Number of days a file is flagged "new" after upload. */
export const STUDY_NEW_WINDOW_DAYS = 7;

export function isNewFile(createdAt: string, now: number = Date.now()): boolean {
  return now - new Date(createdAt).getTime() < STUDY_NEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

// ============================================================
// Pure helpers (audience + download resolution)
// ============================================================

/**
 * Is a folder visible to a student?
 *   - target_exams empty OR intersects the student's classroom-type set, AND
 *   - target_programs empty OR includes the student's program.
 * When the student's exam set is unknown (empty), the exam filter is skipped so nothing is
 * hidden by accident (default show-all).
 */
export function isFolderVisibleToStudent(
  folder: Pick<NexusStudyFolder, 'target_exams' | 'target_programs'>,
  studentExams: string[],
  studentProgram: string | null,
): boolean {
  const exams = folder.target_exams || [];
  const programs = folder.target_programs || [];

  if (exams.length > 0 && studentExams.length > 0) {
    if (!exams.some((e) => studentExams.includes(e))) return false;
  }
  if (programs.length > 0 && studentProgram) {
    if (!programs.includes(studentProgram)) return false;
  }
  return true;
}

/** Effective downloadable: file override wins, else folder default, else false. */
export function effectiveDownloadable(
  file: Pick<NexusStudyFile, 'allow_download'>,
  folder: Pick<NexusStudyFolder, 'allow_download'>,
): boolean {
  if (file.allow_download !== null && file.allow_download !== undefined) {
    return file.allow_download;
  }
  return folder.allow_download ?? false;
}

/** Map a MIME type to a coarse kind for the browser. */
export function fileKind(fileType: string | null): NexusStudyFileKind {
  if (!fileType) return 'other';
  if (fileType === 'application/pdf') return 'pdf';
  if (fileType.startsWith('image/')) return 'image';
  return 'other';
}

// ============================================================
// Reads
// ============================================================

/** Child folders of a parent (null = root). Active (non-deleted) only by default.
 *  System folders (e.g. assignment/drill attachments) are hidden from the browse tree. */
export async function listChildFolders(
  parentId: string | null,
  client?: TypedSupabaseClient,
): Promise<NexusStudyFolder[]> {
  const supabase = client || getSupabaseAdminClient();
  let query = supabase
    .from(FOLDERS as any)
    .select('*')
    .eq('is_deleted', false)
    .eq('is_system', false)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  query = parentId === null ? query.is('parent_id', null) : query.eq('parent_id', parentId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as NexusStudyFolder[];
}

/** All active folders (for staff move/target pickers and item-count rollups).
 *  System folders are excluded so they never appear as a move target. */
export async function listAllFolders(client?: TypedSupabaseClient): Promise<NexusStudyFolder[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(FOLDERS as any)
    .select('*')
    .eq('is_deleted', false)
    .eq('is_system', false)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data || []) as NexusStudyFolder[];
}

export async function getFolderById(
  id: string,
  client?: TypedSupabaseClient,
): Promise<NexusStudyFolder | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(FOLDERS as any)
    .select('*')
    .eq('id', id)
    .eq('is_deleted', false)
    .maybeSingle();
  if (error) throw error;
  return (data as NexusStudyFolder) || null;
}

/** Files directly inside a folder. Active only. */
export async function listFilesInFolder(
  folderId: string,
  client?: TypedSupabaseClient,
): Promise<NexusStudyFile[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(FILES as any)
    .select('*')
    .eq('folder_id', folderId)
    .eq('is_deleted', false)
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });
  if (error) throw error;
  return (data || []) as NexusStudyFile[];
}

export async function getFileById(
  id: string,
  client?: TypedSupabaseClient,
): Promise<NexusStudyFile | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(FILES as any)
    .select('*')
    .eq('id', id)
    .eq('is_deleted', false)
    .maybeSingle();
  if (error) throw error;
  return (data as NexusStudyFile) || null;
}

/** Count active children (subfolders + files) per folder id, for card badges. */
export async function getFolderItemCounts(
  folderIds: string[],
  client?: TypedSupabaseClient,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  if (folderIds.length === 0) return counts;
  const supabase = client || getSupabaseAdminClient();

  const [{ data: subfolders }, { data: files }] = await Promise.all([
    supabase.from(FOLDERS as any).select('parent_id').eq('is_deleted', false).in('parent_id', folderIds),
    supabase.from(FILES as any).select('folder_id').eq('is_deleted', false).in('folder_id', folderIds),
  ]);

  for (const id of folderIds) counts[id] = 0;
  for (const row of subfolders || []) counts[(row as any).parent_id] = (counts[(row as any).parent_id] || 0) + 1;
  for (const row of files || []) counts[(row as any).folder_id] = (counts[(row as any).folder_id] || 0) + 1;
  return counts;
}

/** Walk the parent chain to build a breadcrumb (root-first). */
export async function getBreadcrumb(
  folderId: string | null,
  client?: TypedSupabaseClient,
): Promise<{ id: string; name: string }[]> {
  if (!folderId) return [];
  const supabase = client || getSupabaseAdminClient();
  const trail: { id: string; name: string }[] = [];
  let currentId: string | null = folderId;
  // Guard against cycles / runaway loops.
  for (let i = 0; i < 50 && currentId; i++) {
    const { data } = await supabase
      .from(FOLDERS as any)
      .select('id, name, parent_id')
      .eq('id', currentId)
      .maybeSingle();
    if (!data) break;
    trail.unshift({ id: (data as any).id, name: (data as any).name });
    currentId = (data as any).parent_id;
  }
  return trail;
}

// ============================================================
// Writes (staff)
// ============================================================

export async function createFolder(
  input: {
    name: string;
    parent_id?: string | null;
    description?: string | null;
    target_exams?: string[];
    target_programs?: string[];
    allow_download?: boolean;
    sort_order?: number;
    created_by?: string | null;
  },
  client?: TypedSupabaseClient,
): Promise<NexusStudyFolder> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(FOLDERS as any)
    .insert({
      name: input.name,
      parent_id: input.parent_id ?? null,
      description: input.description ?? null,
      target_exams: input.target_exams ?? [],
      target_programs: input.target_programs ?? [],
      allow_download: input.allow_download ?? false,
      sort_order: input.sort_order ?? 0,
      created_by: input.created_by ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as NexusStudyFolder;
}

export async function updateFolder(
  id: string,
  patch: Partial<Pick<NexusStudyFolder,
    'name' | 'parent_id' | 'description' | 'target_exams' | 'target_programs' | 'allow_download' | 'sort_order'>>,
  client?: TypedSupabaseClient,
): Promise<NexusStudyFolder> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(FOLDERS as any)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as NexusStudyFolder;
}

/** Soft-delete a folder and its entire subtree (descendant folders + their files). */
export async function softDeleteFolderTree(
  id: string,
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  // Collect the subtree folder ids breadth-first.
  const all = await listAllFolders(supabase);
  const childrenOf = new Map<string | null, string[]>();
  for (const f of all) {
    const arr = childrenOf.get(f.parent_id) || [];
    arr.push(f.id);
    childrenOf.set(f.parent_id, arr);
  }
  const subtree: string[] = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    subtree.push(cur);
    for (const c of childrenOf.get(cur) || []) stack.push(c);
  }

  const now = new Date().toISOString();
  await supabase.from(FILES as any).update({ is_deleted: true, updated_at: now }).in('folder_id', subtree);
  await supabase.from(FOLDERS as any).update({ is_deleted: true, updated_at: now }).in('id', subtree);
}

export async function createFileRecord(
  input: {
    folder_id: string;
    title: string;
    file_name: string;
    file_type?: string | null;
    file_size_bytes?: number | null;
    page_count?: number | null;
    sharepoint_item_id?: string | null;
    sharepoint_web_url?: string | null;
    storage_path?: string | null;
    allow_download?: boolean | null;
    sort_order?: number;
    uploaded_by?: string | null;
  },
  client?: TypedSupabaseClient,
): Promise<NexusStudyFile> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(FILES as any)
    .insert({
      folder_id: input.folder_id,
      title: input.title,
      file_name: input.file_name,
      file_type: input.file_type ?? null,
      file_size_bytes: input.file_size_bytes ?? null,
      page_count: input.page_count ?? null,
      sharepoint_item_id: input.sharepoint_item_id ?? null,
      sharepoint_web_url: input.sharepoint_web_url ?? null,
      storage_path: input.storage_path ?? null,
      allow_download: input.allow_download ?? null,
      sort_order: input.sort_order ?? 0,
      uploaded_by: input.uploaded_by ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as NexusStudyFile;
}

export async function updateFile(
  id: string,
  patch: Partial<Pick<NexusStudyFile, 'title' | 'folder_id' | 'allow_download' | 'sort_order'>>,
  client?: TypedSupabaseClient,
): Promise<NexusStudyFile> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(FILES as any)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as NexusStudyFile;
}

export async function softDeleteFile(id: string, client?: TypedSupabaseClient): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase
    .from(FILES as any)
    .update({ is_deleted: true, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// ============================================================
// Comments (Google Classroom style: public class stream + private student threads)
// ============================================================

/**
 * Comments a student may see on a file: every public class comment, plus their own private thread
 * (their roots + teacher replies, both carry thread_student_id = the student). A student can never
 * see another student's private thread.
 */
export async function listFileCommentsForStudent(
  fileId: string,
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<NexusStudyFileCommentWithAuthor[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(COMMENTS as any)
    .select(`*, ${AUTHOR_JOIN}`)
    .eq('file_id', fileId)
    .eq('is_deleted', false)
    .or(`visibility.eq.public,thread_student_id.eq.${studentId}`)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []) as NexusStudyFileCommentWithAuthor[];
}

/** All non-deleted comments on a file (public + every private thread) for staff. */
export async function listFileCommentsForStaff(
  fileId: string,
  client?: TypedSupabaseClient,
): Promise<NexusStudyFileCommentWithAuthor[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(COMMENTS as any)
    .select(`*, ${AUTHOR_JOIN}`)
    .eq('file_id', fileId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []) as NexusStudyFileCommentWithAuthor[];
}

export async function addFileComment(
  input: {
    file_id: string;
    author_id: string;
    author_role: NexusStudyCommentAuthorRole;
    visibility: NexusStudyCommentVisibility;
    thread_student_id: string | null;
    body: string;
  },
  client?: TypedSupabaseClient,
): Promise<NexusStudyFileCommentWithAuthor> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(COMMENTS as any)
    .insert({
      file_id: input.file_id,
      author_id: input.author_id,
      author_role: input.author_role,
      visibility: input.visibility,
      thread_student_id: input.thread_student_id,
      body: input.body,
    })
    .select(`*, ${AUTHOR_JOIN}`)
    .single();
  if (error) throw error;
  return data as NexusStudyFileCommentWithAuthor;
}

/** Teacher moderation: hide a comment from students. */
export async function softDeleteComment(
  commentId: string,
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase
    .from(COMMENTS as any)
    .update({ is_deleted: true, updated_at: new Date().toISOString() })
    .eq('id', commentId);
  if (error) throw error;
}

/** Count of non-deleted comments per file id (public + private), for card badges. */
export async function getCommentCounts(
  fileIds: string[],
  client?: TypedSupabaseClient,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  if (fileIds.length === 0) return counts;
  const supabase = client || getSupabaseAdminClient();
  const { data } = await supabase
    .from(COMMENTS as any)
    .select('file_id')
    .eq('is_deleted', false)
    .in('file_id', fileIds);
  for (const id of fileIds) counts[id] = 0;
  for (const row of data || []) counts[(row as any).file_id] = (counts[(row as any).file_id] || 0) + 1;
  return counts;
}

/**
 * Teacher Feedback inbox: unresolved STUDENT comments grouped into threads
 * (file_id, visibility, thread_student_id), newest first. Comments on soft-deleted files are excluded.
 */
export async function getOpenStudyFeedback(
  client?: TypedSupabaseClient,
): Promise<NexusStudyFeedbackThread[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(COMMENTS as any)
    .select(
      `id, file_id, visibility, thread_student_id, body, created_at,
       ${AUTHOR_JOIN},
       file:nexus_study_files!inner(id, title, folder_id, is_deleted)`,
    )
    .eq('is_deleted', false)
    .eq('is_resolved', false)
    .eq('author_role', 'student')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rows = ((data || []) as any[]).filter((r) => r.file && r.file.is_deleted === false);

  // Group into threads; rows are already newest-first so the first per key is the latest.
  const groups = new Map<string, NexusStudyFeedbackThread & { _folderId: string }>();
  for (const r of rows) {
    const key = `${r.file_id}::${r.visibility}::${r.thread_student_id ?? 'public'}`;
    const existing = groups.get(key);
    if (existing) {
      existing.open_count += 1;
      continue;
    }
    groups.set(key, {
      file_id: r.file_id,
      file_title: r.file.title,
      folder_id: r.file.folder_id,
      breadcrumb: [],
      visibility: r.visibility,
      student: r.visibility === 'private' && r.author ? r.author : null,
      open_count: 1,
      latest_snippet: (r.body || '').slice(0, 140),
      latest_at: r.created_at,
      _folderId: r.file.folder_id,
    });
  }

  // Attach breadcrumbs, resolving each distinct folder once.
  const result = [...groups.values()];
  const crumbCache = new Map<string, { id: string; name: string }[]>();
  for (const t of result) {
    if (!crumbCache.has(t._folderId)) {
      crumbCache.set(t._folderId, await getBreadcrumb(t._folderId, supabase));
    }
    t.breadcrumb = crumbCache.get(t._folderId)!;
  }
  return result.map(({ _folderId, ...t }) => t);
}

/** Mark every unresolved student comment in a thread resolved. */
export async function resolveStudyThread(
  thread: { file_id: string; visibility: NexusStudyCommentVisibility; thread_student_id: string | null },
  resolvedBy: string,
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  let query = supabase
    .from(COMMENTS as any)
    .update({
      is_resolved: true,
      resolved_by: resolvedBy,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('file_id', thread.file_id)
    .eq('visibility', thread.visibility)
    .eq('is_resolved', false)
    .eq('author_role', 'student');
  query = thread.thread_student_id
    ? query.eq('thread_student_id', thread.thread_student_id)
    : query.is('thread_student_id', null);
  const { error } = await query;
  if (error) throw error;
}

// ============================================================
// Engagement: reads (unread badges) + favorites (starred)
// ============================================================

/** Record that a user opened a file (idempotent; bumps opened_at). Call once per open. */
export async function markFileOpened(
  userId: string,
  fileId: string,
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase
    .from(READS as any)
    .upsert(
      { user_id: userId, file_id: fileId, opened_at: new Date().toISOString() },
      { onConflict: 'user_id,file_id' },
    );
  if (error) throw error;
}

/** Which of these file ids the user has already opened. */
export async function listReadFileIds(
  userId: string,
  fileIds: string[],
  client?: TypedSupabaseClient,
): Promise<Set<string>> {
  if (fileIds.length === 0) return new Set();
  const supabase = client || getSupabaseAdminClient();
  const { data } = await supabase
    .from(READS as any)
    .select('file_id')
    .eq('user_id', userId)
    .in('file_id', fileIds);
  return new Set((data || []).map((r: any) => r.file_id));
}

/** Direct-child unread file counts per folder (no subtree recursion). */
export async function getFolderUnreadCounts(
  userId: string,
  folderIds: string[],
  client?: TypedSupabaseClient,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const id of folderIds) counts[id] = 0;
  if (folderIds.length === 0) return counts;
  const supabase = client || getSupabaseAdminClient();

  const { data: files } = await supabase
    .from(FILES as any)
    .select('id, folder_id')
    .eq('is_deleted', false)
    .in('folder_id', folderIds);
  const fileRows = (files || []) as { id: string; folder_id: string }[];
  const read = await listReadFileIds(userId, fileRows.map((f) => f.id), supabase);
  for (const f of fileRows) {
    if (!read.has(f.id)) counts[f.folder_id] = (counts[f.folder_id] || 0) + 1;
  }
  return counts;
}

/** Toggle a favorite; returns the new state (true = now favorited). */
export async function toggleFavorite(
  userId: string,
  fileId: string,
  client?: TypedSupabaseClient,
): Promise<boolean> {
  const supabase = client || getSupabaseAdminClient();
  const { data: existing } = await supabase
    .from(FAVORITES as any)
    .select('file_id')
    .eq('user_id', userId)
    .eq('file_id', fileId)
    .maybeSingle();
  if (existing) {
    const { error } = await supabase
      .from(FAVORITES as any)
      .delete()
      .eq('user_id', userId)
      .eq('file_id', fileId);
    if (error) throw error;
    return false;
  }
  const { error } = await supabase
    .from(FAVORITES as any)
    .insert({ user_id: userId, file_id: fileId });
  if (error) throw error;
  return true;
}

/** Which of these file ids the user has starred. */
export async function listFavoriteFileIds(
  userId: string,
  fileIds: string[],
  client?: TypedSupabaseClient,
): Promise<Set<string>> {
  if (fileIds.length === 0) return new Set();
  const supabase = client || getSupabaseAdminClient();
  const { data } = await supabase
    .from(FAVORITES as any)
    .select('file_id')
    .eq('user_id', userId)
    .in('file_id', fileIds);
  return new Set((data || []).map((r: any) => r.file_id));
}

/** A student's starred files (view-safe DTOs with breadcrumb), audience re-checked. */
export async function listFavorites(
  userId: string,
  studentExams: string[],
  studentProgram: string | null,
  client?: TypedSupabaseClient,
): Promise<(NexusStudyFileDTO & { breadcrumb: { id: string; name: string }[] })[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data: favs } = await supabase
    .from(FAVORITES as any)
    .select('file_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  const favRows = (favs || []) as { file_id: string; created_at: string }[];
  if (favRows.length === 0) return [];

  const { data: fileRows } = await supabase
    .from(FILES as any)
    .select('*')
    .eq('is_deleted', false)
    .in('id', favRows.map((f) => f.file_id));
  const files = (fileRows || []) as NexusStudyFile[];

  const folderMap = await getFolderMap(supabase);
  const now = Date.now();
  const out: (NexusStudyFileDTO & { breadcrumb: { id: string; name: string }[] })[] = [];
  // Preserve favorite order (favRows is newest-first).
  const byId = new Map(files.map((f) => [f.id, f]));
  for (const fav of favRows) {
    const file = byId.get(fav.file_id);
    if (!file) continue;
    const folder = folderMap.get(file.folder_id);
    if (!folder || folder.is_deleted) continue;
    if (!isFolderVisibleToStudent(folder, studentExams, studentProgram)) continue;
    out.push({
      id: file.id,
      folder_id: file.folder_id,
      title: file.title,
      file_name: file.file_name,
      file_type: file.file_type,
      file_size_bytes: file.file_size_bytes,
      page_count: file.page_count,
      kind: fileKind(file.file_type),
      downloadable: effectiveDownloadable(file, folder),
      sort_order: file.sort_order,
      created_at: file.created_at,
      is_new: isNewFile(file.created_at, now),
      is_favorite: true,
      breadcrumb: buildBreadcrumb(folder.id, folderMap),
    });
  }
  return out;
}

// ============================================================
// Search
// ============================================================

/** Load all active folders into an id->folder map (single query) for in-memory tree walks. */
async function getFolderMap(client?: TypedSupabaseClient): Promise<Map<string, NexusStudyFolder>> {
  const supabase = client || getSupabaseAdminClient();
  const { data } = await supabase.from(FOLDERS as any).select('*').eq('is_deleted', false);
  const map = new Map<string, NexusStudyFolder>();
  for (const f of (data || []) as NexusStudyFolder[]) map.set(f.id, f);
  return map;
}

/** Build a root-first breadcrumb for a folder id from an in-memory folder map. */
function buildBreadcrumb(
  folderId: string | null,
  folderMap: Map<string, NexusStudyFolder>,
): { id: string; name: string }[] {
  const trail: { id: string; name: string }[] = [];
  let cur = folderId;
  for (let i = 0; i < 50 && cur; i++) {
    const f = folderMap.get(cur);
    if (!f) break;
    trail.unshift({ id: f.id, name: f.name });
    cur = f.parent_id;
  }
  return trail;
}

/**
 * Search folders + files by name. Students only see hits inside folders in their audience
 * (a file whose parent folder is hidden is dropped, so names never leak from hidden folders).
 */
export async function searchStudyMaterials(
  q: string,
  ctx: { staff: boolean; studentExams: string[]; studentProgram: string | null },
  client?: TypedSupabaseClient,
): Promise<any[]> {
  // Strip characters that would break PostgREST filter parsing (comma/paren separators in .or(),
  // and ilike wildcards % _ and the escape \).
  const term = q.trim().replace(/[,()%_\\]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!term) return [];
  const supabase = client || getSupabaseAdminClient();
  const like = `%${term}%`;
  const folderMap = await getFolderMap(supabase);

  const visible = (folder: NexusStudyFolder | undefined): boolean => {
    if (!folder || folder.is_deleted) return false;
    if (ctx.staff) return true;
    return isFolderVisibleToStudent(folder, ctx.studentExams, ctx.studentProgram);
  };

  // Folder hits.
  const { data: folderHits } = await supabase
    .from(FOLDERS as any)
    .select('id, name, parent_id')
    .eq('is_deleted', false)
    .eq('is_system', false)
    .ilike('name', like)
    .limit(50);

  const results: any[] = [];
  for (const f of (folderHits || []) as any[]) {
    const folder = folderMap.get(f.id);
    if (!visible(folder)) continue;
    results.push({
      kind: 'folder',
      id: f.id,
      name: f.name,
      folder_id: f.id,
      breadcrumb: buildBreadcrumb(f.parent_id, folderMap),
    });
  }

  // File hits (match title or file_name).
  const { data: fileHits } = await supabase
    .from(FILES as any)
    .select('*')
    .eq('is_deleted', false)
    .or(`title.ilike.${like},file_name.ilike.${like}`)
    .limit(50);
  for (const file of (fileHits || []) as NexusStudyFile[]) {
    const folder = folderMap.get(file.folder_id);
    if (!visible(folder)) continue;
    results.push({
      kind: 'file',
      id: file.id,
      name: file.title,
      folder_id: file.folder_id,
      breadcrumb: buildBreadcrumb(file.folder_id, folderMap),
      file_kind: fileKind(file.file_type),
      downloadable: effectiveDownloadable(file, folder!),
    });
  }

  return results;
}
