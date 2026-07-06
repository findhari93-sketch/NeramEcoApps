// @ts-nocheck — nexus_study_folders / nexus_study_files not yet in generated Supabase types;
// regenerate with pnpm supabase:gen:types after the migration is applied.
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type {
  NexusStudyFolder,
  NexusStudyFile,
  NexusStudyFileKind,
} from '../../types';

const FOLDERS = 'nexus_study_folders';
const FILES = 'nexus_study_files';

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
