// @ts-nocheck
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type {
  ExamRecallQuestionType,
  ExamRecallSection,
  ExamRecallTopicCategory,
  ExamRecallThreadStatus,
  ExamRecallAuthorRole,
  ExamRecallClarity,
  ExamRecallVersionStatus,
  ExamRecallVariantType,
  ExamRecallUploadType,
  ExamRecallOCRStatus,
  NexusExamRecallThread,
  NexusExamRecallVersion,
  NexusExamRecallCheckpoint,
  NexusExamRecallDrawingInsert,
  NexusExamRecallTipInsert,
  ExamRecallThreadListItem,
  ExamRecallThreadDetail,
  ExamRecallCheckpointStatus,
  ExamRecallDashboardStats,
  ExamRecallSessionSummary,
  NexusExamRecallTopicDump,
  NexusExamRecallDrawing,
  NexusExamRecallTip,
  NexusExamRecallComment,
  NexusExamRecallUpload,
  NexusExamRecallVariant,
} from '../../types';

// ============================================
// THREAD OPERATIONS
// ============================================

/**
 * Create a new exam recall thread with its first version atomically.
 * Also increments the user's checkpoint counter.
 */
export async function createExamRecallThread(
  data: {
    classroom_id: string;
    exam_year: number;
    exam_date: string;
    session_number: number;
    question_type: ExamRecallQuestionType;
    section: ExamRecallSection;
    topic_category?: ExamRecallTopicCategory | null;
    has_image?: boolean;
    created_by: string;
    initial_version: {
      recall_text: string;
      recall_image_urls?: string[] | null;
      options?: Array<{ id: string; text: string; image_url?: string }> | null;
      my_answer?: string | null;
      my_working?: string | null;
      clarity: ExamRecallClarity;
      has_image_in_original?: boolean | null;
      image_description?: string | null;
      sub_topic_hint?: string | null;
      author_role: ExamRecallAuthorRole;
    };
  },
  client?: TypedSupabaseClient
): Promise<{ thread: NexusExamRecallThread; version: NexusExamRecallVersion }> {
  const supabase = client || getSupabaseAdminClient();

  // 1. Create the thread
  const { data: thread, error: threadError } = await supabase
    .from('nexus_exam_recall_threads')
    .insert({
      classroom_id: data.classroom_id,
      exam_year: data.exam_year,
      exam_date: data.exam_date,
      session_number: data.session_number,
      question_type: data.question_type,
      section: data.section,
      topic_category: data.topic_category ?? null,
      has_image: data.has_image ?? false,
      status: 'raw' as ExamRecallThreadStatus,
      created_by: data.created_by,
    })
    .select()
    .single();

  if (threadError) throw threadError;

  // 2. Create the first version
  const autoApprove = data.initial_version.author_role !== 'student';
  const { data: version, error: versionError } = await supabase
    .from('nexus_exam_recall_versions')
    .insert({
      thread_id: (thread as any).id,
      version_number: 1,
      author_id: data.created_by,
      author_role: data.initial_version.author_role,
      recall_text: data.initial_version.recall_text,
      recall_image_urls: data.initial_version.recall_image_urls ?? null,
      options: data.initial_version.options ?? null,
      my_answer: data.initial_version.my_answer ?? null,
      my_working: data.initial_version.my_working ?? null,
      clarity: data.initial_version.clarity,
      has_image_in_original: data.initial_version.has_image_in_original ?? null,
      image_description: data.initial_version.image_description ?? null,
      sub_topic_hint: data.initial_version.sub_topic_hint ?? null,
      parent_version_id: null,
      status: autoApprove ? 'approved' : 'pending_review',
    } as any)
    .select()
    .single();

  if (versionError) throw versionError;

  // 3. Update thread version_count
  const { error: updateErr } = await supabase
    .from('nexus_exam_recall_threads')
    .update({ version_count: 1 } as any)
    .eq('id', (thread as any).id);

  if (updateErr) throw updateErr;

  // 4. Increment checkpoint aptitude_count (question contribution)
  const checkpointField = data.question_type === 'drawing' ? 'drawing_count' : 'aptitude_count';
  await incrementCheckpoint(
    data.created_by,
    data.classroom_id,
    data.exam_date,
    data.session_number,
    checkpointField as 'drawing_count' | 'aptitude_count' | 'topic_dump_count',
    supabase
  );

  return {
    thread: thread as unknown as NexusExamRecallThread,
    version: version as unknown as NexusExamRecallVersion,
  };
}

/**
 * Get a thread with all versions, confirms, comments, drawings, variants, and uploads.
 * If userId is provided, includes user_has_confirmed and user_has_vouched flags.
 */
export async function getExamRecallThread(
  threadId: string,
  userId?: string,
  client?: TypedSupabaseClient
): Promise<ExamRecallThreadDetail | null> {
  const supabase = client || getSupabaseAdminClient();

  // Fetch thread
  const { data: thread, error: threadError } = await supabase
    .from('nexus_exam_recall_threads')
    .select('*')
    .eq('id', threadId)
    .single();

  if (threadError) {
    if (threadError.code === 'PGRST116') return null; // not found
    throw threadError;
  }

  // Fetch versions with author info
  const { data: versions, error: versionsError } = await supabase
    .from('nexus_exam_recall_versions')
    .select('*')
    .eq('thread_id', threadId)
    .order('version_number', { ascending: true });

  if (versionsError) throw versionsError;

  // Get author info for versions
  const authorIds = [...new Set((versions || []).map((v: any) => v.author_id))];
  const { data: authors, error: authorsError } = await supabase
    .from('users')
    .select('id, name, avatar_url')
    .in('id', authorIds.length > 0 ? authorIds : ['__none__']);

  if (authorsError) throw authorsError;

  const authorMap = new Map((authors || []).map((a: any) => [a.id, a]));

  // Fetch user vouches if userId provided
  let userVouchSet = new Set<string>();
  if (userId) {
    const versionIds = (versions || []).map((v: any) => v.id);
    if (versionIds.length > 0) {
      const { data: vouches } = await supabase
        .from('nexus_exam_recall_vouches')
        .select('version_id')
        .eq('user_id', userId)
        .in('version_id', versionIds);

      userVouchSet = new Set((vouches || []).map((v: any) => v.version_id));
    }
  }

  const enrichedVersions = (versions || []).map((v: any) => ({
    ...v,
    author: authorMap.get(v.author_id) || { id: v.author_id, name: null, avatar_url: null },
    user_has_vouched: userId ? userVouchSet.has(v.id) : false,
  }));

  // Fetch confirms with user info
  const { data: confirms, error: confirmsError } = await supabase
    .from('nexus_exam_recall_confirms')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  if (confirmsError) throw confirmsError;

  const confirmUserIds = [...new Set((confirms || []).map((c: any) => c.user_id))];
  const { data: confirmUsers } = await supabase
    .from('users')
    .select('id, name, avatar_url')
    .in('id', confirmUserIds.length > 0 ? confirmUserIds : ['__none__']);

  const confirmUserMap = new Map((confirmUsers || []).map((u: any) => [u.id, u]));

  const enrichedConfirms = (confirms || []).map((c: any) => ({
    ...c,
    user: confirmUserMap.get(c.user_id) || { id: c.user_id, name: null, avatar_url: null },
  }));

  // Fetch comments with user info
  const { data: comments, error: commentsError } = await supabase
    .from('nexus_exam_recall_comments')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  if (commentsError) throw commentsError;

  const commentUserIds = [...new Set((comments || []).map((c: any) => c.user_id))];
  const { data: commentUsers } = await supabase
    .from('users')
    .select('id, name, avatar_url')
    .in('id', commentUserIds.length > 0 ? commentUserIds : ['__none__']);

  const commentUserMap = new Map((commentUsers || []).map((u: any) => [u.id, u]));

  const enrichedComments = (comments || []).map((c: any) => ({
    ...c,
    user: commentUserMap.get(c.user_id) || { id: c.user_id, name: null, avatar_url: null },
  }));

  // Fetch drawings
  const { data: drawings, error: drawingsError } = await supabase
    .from('nexus_exam_recall_drawings')
    .select('*')
    .eq('thread_id', threadId)
    .order('question_number', { ascending: true });

  if (drawingsError) throw drawingsError;

  // Fetch variants with linked thread summary
  const { data: variants, error: variantsError } = await supabase
    .from('nexus_exam_recall_variants')
    .select('*')
    .eq('thread_id', threadId);

  if (variantsError) throw variantsError;

  const linkedThreadIds = (variants || []).map((v: any) => v.linked_thread_id);
  const { data: linkedThreads } = await supabase
    .from('nexus_exam_recall_threads')
    .select('id, exam_date, session_number, status')
    .in('id', linkedThreadIds.length > 0 ? linkedThreadIds : ['__none__']);

  const linkedMap = new Map((linkedThreads || []).map((t: any) => [t.id, t]));

  const enrichedVariants = (variants || []).map((v: any) => ({
    ...v,
    linked_thread: linkedMap.get(v.linked_thread_id) || {
      id: v.linked_thread_id,
      exam_date: '',
      session_number: 0,
      status: 'raw',
    },
  }));

  // Fetch uploads
  const { data: uploads, error: uploadsError } = await supabase
    .from('nexus_exam_recall_uploads')
    .select('*')
    .or(`thread_id.eq.${threadId},version_id.in.(${(versions || []).map((v: any) => v.id).join(',')})`)
    .order('created_at', { ascending: true });

  if (uploadsError) throw uploadsError;

  return {
    ...(thread as any),
    versions: enrichedVersions,
    confirms: enrichedConfirms,
    comments: enrichedComments,
    drawings: (drawings || []) as unknown as NexusExamRecallDrawing[],
    variants: enrichedVariants,
    uploads: (uploads || []) as unknown as NexusExamRecallUpload[],
  } as ExamRecallThreadDetail;
}

/**
 * Paginated list of exam recall threads with latest_version snippet,
 * contributor avatars, and user_has_confirmed flag.
 */
export async function listExamRecallThreads(
  filters: {
    classroom_id: string;
    exam_date?: string;
    session_number?: number;
    section?: ExamRecallSection;
    topic_category?: ExamRecallTopicCategory;
    status?: ExamRecallThreadStatus;
    question_type?: ExamRecallQuestionType;
    search?: string;
  },
  userId?: string,
  page: number = 1,
  pageSize: number = 20,
  client?: TypedSupabaseClient
): Promise<{ data: ExamRecallThreadListItem[]; total: number }> {
  const supabase = client || getSupabaseAdminClient();

  const offset = (page - 1) * pageSize;

  // Build query
  let query = supabase
    .from('nexus_exam_recall_threads')
    .select('*', { count: 'exact' })
    .eq('classroom_id', filters.classroom_id)
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (filters.exam_date) query = query.eq('exam_date', filters.exam_date);
  if (filters.session_number != null) query = query.eq('session_number', filters.session_number);
  if (filters.section) query = query.eq('section', filters.section);
  if (filters.topic_category) query = query.eq('topic_category', filters.topic_category);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.question_type) query = query.eq('question_type', filters.question_type);

  const { data: threads, error, count } = await query;

  if (error) throw error;

  if (!threads || threads.length === 0) {
    return { data: [], total: count ?? 0 };
  }

  const threadIds = threads.map((t: any) => t.id);

  // Get latest version for each thread
  const { data: allVersions, error: versionsError } = await supabase
    .from('nexus_exam_recall_versions')
    .select('thread_id, recall_text, clarity, author_id, version_number')
    .in('thread_id', threadIds)
    .order('version_number', { ascending: false });

  if (versionsError) throw versionsError;

  // Build latest version map (first entry per thread_id = highest version)
  const latestVersionMap = new Map<string, any>();
  const contributorMap = new Map<string, Set<string>>();
  for (const v of (allVersions || []) as any[]) {
    if (!latestVersionMap.has(v.thread_id)) {
      latestVersionMap.set(v.thread_id, v);
    }
    if (!contributorMap.has(v.thread_id)) {
      contributorMap.set(v.thread_id, new Set());
    }
    contributorMap.get(v.thread_id)!.add(v.author_id);
  }

  // Get all unique author IDs for name/avatar
  const allAuthorIds = new Set<string>();
  for (const ids of contributorMap.values()) {
    for (const id of ids) allAuthorIds.add(id);
  }

  const { data: users } = await supabase
    .from('users')
    .select('id, name, avatar_url')
    .in('id', allAuthorIds.size > 0 ? [...allAuthorIds] : ['__none__']);

  const userMap = new Map((users || []).map((u: any) => [u.id, u]));

  // If userId provided, check which threads user has confirmed
  let userConfirmSet = new Set<string>();
  if (userId) {
    const { data: confirms } = await supabase
      .from('nexus_exam_recall_confirms')
      .select('thread_id')
      .eq('user_id', userId)
      .in('thread_id', threadIds);

    userConfirmSet = new Set((confirms || []).map((c: any) => c.thread_id));
  }

  // Search filter (post-query text match on recall_text)
  let filteredThreads = threads as any[];
  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    const matchingThreadIds = new Set<string>();
    for (const v of (allVersions || []) as any[]) {
      if (v.recall_text && v.recall_text.toLowerCase().includes(searchLower)) {
        matchingThreadIds.add(v.thread_id);
      }
    }
    filteredThreads = filteredThreads.filter((t: any) => matchingThreadIds.has(t.id));
  }

  const items: ExamRecallThreadListItem[] = filteredThreads.map((t: any) => {
    const latestV = latestVersionMap.get(t.id);
    const contribIds = contributorMap.get(t.id) || new Set();
    const author = latestV ? userMap.get(latestV.author_id) : null;

    return {
      ...t,
      latest_version: latestV
        ? {
            recall_text: latestV.recall_text,
            clarity: latestV.clarity,
            author_name: author?.name ?? null,
            author_avatar: author?.avatar_url ?? null,
          }
        : null,
      contributors: [...contribIds].map((id) => {
        const u = userMap.get(id);
        return { id, name: u?.name ?? null, avatar_url: u?.avatar_url ?? null };
      }),
      user_has_confirmed: userId ? userConfirmSet.has(t.id) : false,
    };
  });

  return { data: items, total: count ?? 0 };
}

/**
 * Update thread status and optionally set published_question_id.
 */
export async function updateThreadStatus(
  threadId: string,
  status: ExamRecallThreadStatus,
  reviewerId: string,
  publishedQuestionId?: string,
  client?: TypedSupabaseClient
): Promise<NexusExamRecallThread> {
  const supabase = client || getSupabaseAdminClient();

  const updateData: any = { status, updated_at: new Date().toISOString() };
  if (publishedQuestionId) {
    updateData.published_question_id = publishedQuestionId;
  }

  const { data, error } = await supabase
    .from('nexus_exam_recall_threads')
    .update(updateData)
    .eq('id', threadId)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as NexusExamRecallThread;
}

// ============================================
// VERSION OPERATIONS
// ============================================

/**
 * Create a new version for a thread.
 * Auto-sets version_number (max+1) and updates thread.version_count.
 * If author_role is staff/teacher/admin, auto-approve.
 */
export async function createExamRecallVersion(
  data: {
    thread_id: string;
    author_id: string;
    author_role: ExamRecallAuthorRole;
    recall_text: string;
    recall_image_urls?: string[] | null;
    options?: Array<{ id: string; text: string; image_url?: string }> | null;
    my_answer?: string | null;
    my_working?: string | null;
    clarity: ExamRecallClarity;
    has_image_in_original?: boolean | null;
    image_description?: string | null;
    sub_topic_hint?: string | null;
    parent_version_id?: string | null;
  },
  client?: TypedSupabaseClient
): Promise<NexusExamRecallVersion> {
  const supabase = client || getSupabaseAdminClient();

  // Get max version_number for this thread
  const { data: existing, error: existErr } = await supabase
    .from('nexus_exam_recall_versions')
    .select('version_number')
    .eq('thread_id', data.thread_id)
    .order('version_number', { ascending: false })
    .limit(1);

  if (existErr) throw existErr;

  const nextVersion = ((existing || [])[0] as any)?.version_number
    ? ((existing || [])[0] as any).version_number + 1
    : 1;

  const autoApprove = data.author_role !== 'student';

  const { data: version, error } = await supabase
    .from('nexus_exam_recall_versions')
    .insert({
      thread_id: data.thread_id,
      version_number: nextVersion,
      author_id: data.author_id,
      author_role: data.author_role,
      recall_text: data.recall_text,
      recall_image_urls: data.recall_image_urls ?? null,
      options: data.options ?? null,
      my_answer: data.my_answer ?? null,
      my_working: data.my_working ?? null,
      clarity: data.clarity,
      has_image_in_original: data.has_image_in_original ?? null,
      image_description: data.image_description ?? null,
      sub_topic_hint: data.sub_topic_hint ?? null,
      parent_version_id: data.parent_version_id ?? null,
      status: autoApprove ? 'approved' : 'pending_review',
    } as any)
    .select()
    .single();

  if (error) throw error;

  // Update thread version_count
  const { count } = await supabase
    .from('nexus_exam_recall_versions')
    .select('*', { count: 'exact', head: true })
    .eq('thread_id', data.thread_id);

  await supabase
    .from('nexus_exam_recall_threads')
    .update({ version_count: count ?? 1, updated_at: new Date().toISOString() } as any)
    .eq('id', data.thread_id);

  return version as unknown as NexusExamRecallVersion;
}

/**
 * Approve or reject a version.
 */
export async function reviewVersion(
  versionId: string,
  status: 'approved' | 'rejected',
  reviewerId: string,
  client?: TypedSupabaseClient
): Promise<NexusExamRecallVersion> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('nexus_exam_recall_versions')
    .update({
      status,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    } as any)
    .eq('id', versionId)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as NexusExamRecallVersion;
}

// ============================================
// CONFIRM & VOUCH
// ============================================

/**
 * Toggle confirm on a thread. Upserts or deletes.
 * Returns the new confirmed state and updated count.
 */
export async function toggleConfirm(
  threadId: string,
  userId: string,
  examDate?: string,
  sessionNumber?: number,
  note?: string,
  client?: TypedSupabaseClient
): Promise<{ confirmed: boolean; new_count: number }> {
  const supabase = client || getSupabaseAdminClient();

  // Check if user already confirmed
  const { data: existing } = await supabase
    .from('nexus_exam_recall_confirms')
    .select('id')
    .eq('thread_id', threadId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    // Remove confirm
    const { error: deleteErr } = await supabase
      .from('nexus_exam_recall_confirms')
      .delete()
      .eq('id', (existing as any).id);

    if (deleteErr) throw deleteErr;
  } else {
    // Add confirm
    const { error: insertErr } = await supabase
      .from('nexus_exam_recall_confirms')
      .insert({
        thread_id: threadId,
        user_id: userId,
        exam_date: examDate ?? null,
        session_number: sessionNumber ?? null,
        note: note ?? null,
      } as any);

    if (insertErr) throw insertErr;
  }

  // Recount
  const { count } = await supabase
    .from('nexus_exam_recall_confirms')
    .select('*', { count: 'exact', head: true })
    .eq('thread_id', threadId);

  const newCount = count ?? 0;

  // Update denormalized count on thread
  await supabase
    .from('nexus_exam_recall_threads')
    .update({ confirm_count: newCount, updated_at: new Date().toISOString() } as any)
    .eq('id', threadId);

  return { confirmed: !existing, new_count: newCount };
}

/**
 * Toggle vouch on a version. Upserts or deletes.
 * Returns the new vouched state and updated count.
 * Also updates thread.vouch_count (max across all versions).
 */
export async function toggleVouch(
  versionId: string,
  userId: string,
  client?: TypedSupabaseClient
): Promise<{ vouched: boolean; new_count: number }> {
  const supabase = client || getSupabaseAdminClient();

  // Check if user already vouched
  const { data: existing } = await supabase
    .from('nexus_exam_recall_vouches')
    .select('id')
    .eq('version_id', versionId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    const { error: deleteErr } = await supabase
      .from('nexus_exam_recall_vouches')
      .delete()
      .eq('id', (existing as any).id);

    if (deleteErr) throw deleteErr;
  } else {
    const { error: insertErr } = await supabase
      .from('nexus_exam_recall_vouches')
      .insert({
        version_id: versionId,
        user_id: userId,
      } as any);

    if (insertErr) throw insertErr;
  }

  // Recount for this version
  const { count: versionCount } = await supabase
    .from('nexus_exam_recall_vouches')
    .select('*', { count: 'exact', head: true })
    .eq('version_id', versionId);

  const newCount = versionCount ?? 0;

  // Update denormalized vouch_count on version
  await supabase
    .from('nexus_exam_recall_versions')
    .update({ vouch_count: newCount } as any)
    .eq('id', versionId);

  // Get thread_id from version
  const { data: versionRow } = await supabase
    .from('nexus_exam_recall_versions')
    .select('thread_id')
    .eq('id', versionId)
    .single();

  if (versionRow) {
    // Get max vouch_count across all versions for this thread
    const { data: allVersions } = await supabase
      .from('nexus_exam_recall_versions')
      .select('vouch_count')
      .eq('thread_id', (versionRow as any).thread_id);

    const maxVouch = Math.max(0, ...((allVersions || []) as any[]).map((v) => v.vouch_count || 0));

    await supabase
      .from('nexus_exam_recall_threads')
      .update({ vouch_count: maxVouch, updated_at: new Date().toISOString() } as any)
      .eq('id', (versionRow as any).thread_id);
  }

  return { vouched: !existing, new_count: newCount };
}

// ============================================
// COMMENTS
// ============================================

/**
 * Create a comment on a thread.
 */
export async function createExamRecallComment(
  data: {
    thread_id: string;
    user_id: string;
    body: string;
    is_staff?: boolean;
    parent_comment_id?: string | null;
  },
  client?: TypedSupabaseClient
): Promise<NexusExamRecallComment> {
  const supabase = client || getSupabaseAdminClient();

  const { data: comment, error } = await supabase
    .from('nexus_exam_recall_comments')
    .insert({
      thread_id: data.thread_id,
      user_id: data.user_id,
      body: data.body,
      is_staff: data.is_staff ?? false,
      parent_comment_id: data.parent_comment_id ?? null,
    } as any)
    .select()
    .single();

  if (error) throw error;
  return comment as unknown as NexusExamRecallComment;
}

/**
 * List all comments for a thread, joined with user name/avatar,
 * ordered by created_at ascending.
 */
export async function listExamRecallComments(
  threadId: string,
  client?: TypedSupabaseClient
): Promise<Array<NexusExamRecallComment & { user: { id: string; name: string | null; avatar_url: string | null } }>> {
  const supabase = client || getSupabaseAdminClient();

  const { data: comments, error } = await supabase
    .from('nexus_exam_recall_comments')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  const userIds = [...new Set((comments || []).map((c: any) => c.user_id))];
  const { data: users } = await supabase
    .from('users')
    .select('id, name, avatar_url')
    .in('id', userIds.length > 0 ? userIds : ['__none__']);

  const userMap = new Map((users || []).map((u: any) => [u.id, u]));

  return (comments || []).map((c: any) => ({
    ...c,
    user: userMap.get(c.user_id) || { id: c.user_id, name: null, avatar_url: null },
  }));
}

// ============================================
// CHECKPOINT
// ============================================

/**
 * Get existing checkpoint or create a new one.
 */
export async function getOrCreateCheckpoint(
  userId: string,
  classroomId: string,
  examDate: string,
  sessionNumber: number,
  client?: TypedSupabaseClient
): Promise<NexusExamRecallCheckpoint> {
  const supabase = client || getSupabaseAdminClient();

  // Try to find existing
  const { data: existing, error: findErr } = await supabase
    .from('nexus_exam_recall_checkpoints')
    .select('*')
    .eq('user_id', userId)
    .eq('classroom_id', classroomId)
    .eq('exam_date', examDate)
    .eq('session_number', sessionNumber)
    .maybeSingle();

  if (findErr) throw findErr;
  if (existing) return existing as unknown as NexusExamRecallCheckpoint;

  // Derive exam_year from exam_date
  const examYear = new Date(examDate).getFullYear();

  // Create new checkpoint
  const { data: created, error: createErr } = await supabase
    .from('nexus_exam_recall_checkpoints')
    .insert({
      user_id: userId,
      classroom_id: classroomId,
      exam_year: examYear,
      exam_date: examDate,
      session_number: sessionNumber,
      drawing_count: 0,
      aptitude_count: 0,
      topic_dump_count: 0,
      tip_submitted: false,
      browse_unlocked: false,
    } as any)
    .select()
    .single();

  if (createErr) throw createErr;
  return created as unknown as NexusExamRecallCheckpoint;
}

/**
 * Increment a checkpoint field by 1.
 * Checks if unlock threshold is met (3 drawing + 5 aptitude) and sets browse_unlocked.
 */
export async function incrementCheckpoint(
  userId: string,
  classroomId: string,
  examDate: string,
  sessionNumber: number,
  field: 'drawing_count' | 'aptitude_count' | 'topic_dump_count',
  client?: TypedSupabaseClient
): Promise<NexusExamRecallCheckpoint> {
  const supabase = client || getSupabaseAdminClient();

  // Get or create checkpoint
  const checkpoint = await getOrCreateCheckpoint(userId, classroomId, examDate, sessionNumber, supabase);

  // Increment the field
  const currentValue = (checkpoint as any)[field] as number;
  const newValue = currentValue + 1;

  const updateData: any = { [field]: newValue, updated_at: new Date().toISOString() };

  // Check unlock threshold
  const drawingCount = field === 'drawing_count' ? newValue : checkpoint.drawing_count;
  const aptitudeCount = field === 'aptitude_count' ? newValue : checkpoint.aptitude_count;

  if (!checkpoint.browse_unlocked && drawingCount >= 3 && aptitudeCount >= 5) {
    updateData.browse_unlocked = true;
    updateData.unlocked_at = new Date().toISOString();
  }

  const { data: updated, error } = await supabase
    .from('nexus_exam_recall_checkpoints')
    .update(updateData)
    .eq('id', checkpoint.id)
    .select()
    .single();

  if (error) throw error;
  return updated as unknown as NexusExamRecallCheckpoint;
}

/**
 * Get checkpoint status for a user/session.
 */
export async function getCheckpointStatus(
  userId: string,
  classroomId: string,
  examDate: string,
  sessionNumber: number,
  client?: TypedSupabaseClient
): Promise<ExamRecallCheckpointStatus> {
  const supabase = client || getSupabaseAdminClient();

  const { data: checkpoint } = await supabase
    .from('nexus_exam_recall_checkpoints')
    .select('*')
    .eq('user_id', userId)
    .eq('classroom_id', classroomId)
    .eq('exam_date', examDate)
    .eq('session_number', sessionNumber)
    .maybeSingle();

  if (!checkpoint) {
    return {
      checkpoint: null,
      is_unlocked: false,
      drawing_remaining: 3,
      aptitude_remaining: 5,
    };
  }

  const cp = checkpoint as unknown as NexusExamRecallCheckpoint;
  return {
    checkpoint: cp,
    is_unlocked: cp.browse_unlocked,
    drawing_remaining: Math.max(0, 3 - cp.drawing_count),
    aptitude_remaining: Math.max(0, 5 - cp.aptitude_count),
  };
}

// ============================================
// TOPIC DUMPS
// ============================================

/**
 * Create a topic dump entry and increment checkpoint.topic_dump_count.
 */
export async function createTopicDump(
  data: {
    user_id: string;
    classroom_id: string;
    exam_year: number;
    exam_date: string;
    session_number: number;
    topic_category: string;
    estimated_count?: number | null;
    brief_details?: string | null;
  },
  client?: TypedSupabaseClient
): Promise<NexusExamRecallTopicDump> {
  const supabase = client || getSupabaseAdminClient();

  const { data: dump, error } = await supabase
    .from('nexus_exam_recall_topic_dumps')
    .insert({
      user_id: data.user_id,
      classroom_id: data.classroom_id,
      exam_year: data.exam_year,
      exam_date: data.exam_date,
      session_number: data.session_number,
      topic_category: data.topic_category,
      estimated_count: data.estimated_count ?? null,
      brief_details: data.brief_details ?? null,
    } as any)
    .select()
    .single();

  if (error) throw error;

  // Increment checkpoint
  await incrementCheckpoint(
    data.user_id,
    data.classroom_id,
    data.exam_date,
    data.session_number,
    'topic_dump_count',
    supabase
  );

  return dump as unknown as NexusExamRecallTopicDump;
}

/**
 * List all topic dumps for a session.
 */
export async function listTopicDumps(
  classroomId: string,
  examDate: string,
  sessionNumber: number,
  client?: TypedSupabaseClient
): Promise<NexusExamRecallTopicDump[]> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('nexus_exam_recall_topic_dumps')
    .select('*')
    .eq('classroom_id', classroomId)
    .eq('exam_date', examDate)
    .eq('session_number', sessionNumber)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []) as unknown as NexusExamRecallTopicDump[];
}

// ============================================
// DRAWINGS
// ============================================

/**
 * Create a drawing recall entry and increment checkpoint.drawing_count.
 */
export async function createDrawingRecall(
  data: NexusExamRecallDrawingInsert,
  client?: TypedSupabaseClient
): Promise<NexusExamRecallDrawing> {
  const supabase = client || getSupabaseAdminClient();

  const { data: drawing, error } = await supabase
    .from('nexus_exam_recall_drawings')
    .insert(data as any)
    .select()
    .single();

  if (error) throw error;

  // We need thread info to increment checkpoint — get thread's classroom/date/session
  const { data: thread } = await supabase
    .from('nexus_exam_recall_threads')
    .select('classroom_id, exam_date, session_number')
    .eq('id', data.thread_id)
    .single();

  if (thread) {
    await incrementCheckpoint(
      data.created_by,
      (thread as any).classroom_id,
      (thread as any).exam_date,
      (thread as any).session_number,
      'drawing_count',
      supabase
    );
  }

  return drawing as unknown as NexusExamRecallDrawing;
}

/**
 * List drawings for a thread.
 */
export async function listDrawingRecalls(
  threadId: string,
  client?: TypedSupabaseClient
): Promise<NexusExamRecallDrawing[]> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('nexus_exam_recall_drawings')
    .select('*')
    .eq('thread_id', threadId)
    .order('question_number', { ascending: true });

  if (error) throw error;
  return (data || []) as unknown as NexusExamRecallDrawing[];
}

// ============================================
// TIPS
// ============================================

/**
 * Create an exam recall tip and update checkpoint.tip_submitted.
 */
export async function createExamRecallTip(
  data: NexusExamRecallTipInsert,
  client?: TypedSupabaseClient
): Promise<NexusExamRecallTip> {
  const supabase = client || getSupabaseAdminClient();

  const { data: tip, error } = await supabase
    .from('nexus_exam_recall_tips')
    .insert(data as any)
    .select()
    .single();

  if (error) throw error;

  // Update checkpoint tip_submitted
  const checkpoint = await getOrCreateCheckpoint(
    data.user_id,
    data.classroom_id,
    data.exam_date,
    data.session_number,
    supabase
  );

  if (!checkpoint.tip_submitted) {
    await supabase
      .from('nexus_exam_recall_checkpoints')
      .update({ tip_submitted: true, updated_at: new Date().toISOString() } as any)
      .eq('id', checkpoint.id);
  }

  return tip as unknown as NexusExamRecallTip;
}

/**
 * List exam recall tips, ordered by upvote_count desc.
 */
export async function listExamRecallTips(
  classroomId: string,
  examDate?: string,
  client?: TypedSupabaseClient
): Promise<NexusExamRecallTip[]> {
  const supabase = client || getSupabaseAdminClient();

  let query = supabase
    .from('nexus_exam_recall_tips')
    .select('*')
    .eq('classroom_id', classroomId)
    .order('upvote_count', { ascending: false });

  if (examDate) {
    query = query.eq('exam_date', examDate);
  }

  const { data, error } = await query;

  if (error) throw error;
  return (data || []) as unknown as NexusExamRecallTip[];
}

/**
 * Upvote a tip (simple increment, no toggle).
 */
export async function upvoteTip(
  tipId: string,
  userId: string,
  client?: TypedSupabaseClient
): Promise<NexusExamRecallTip> {
  const supabase = client || getSupabaseAdminClient();

  // Get current count
  const { data: existing, error: fetchErr } = await supabase
    .from('nexus_exam_recall_tips')
    .select('upvote_count')
    .eq('id', tipId)
    .single();

  if (fetchErr) throw fetchErr;

  const newCount = ((existing as any).upvote_count || 0) + 1;

  const { data, error } = await supabase
    .from('nexus_exam_recall_tips')
    .update({ upvote_count: newCount } as any)
    .eq('id', tipId)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as NexusExamRecallTip;
}

// ============================================
// VARIANTS
// ============================================

/**
 * Link two threads as variants (creates bidirectional links).
 */
export async function linkVariant(
  threadId: string,
  linkedThreadId: string,
  variantType: ExamRecallVariantType,
  linkedBy?: string,
  confidence?: number,
  client?: TypedSupabaseClient
): Promise<NexusExamRecallVariant[]> {
  const supabase = client || getSupabaseAdminClient();

  // Create both directions
  const { data, error } = await supabase
    .from('nexus_exam_recall_variants')
    .insert([
      {
        thread_id: threadId,
        linked_thread_id: linkedThreadId,
        variant_type: variantType,
        linked_by: linkedBy ?? null,
        confidence: confidence ?? null,
      },
      {
        thread_id: linkedThreadId,
        linked_thread_id: threadId,
        variant_type: variantType,
        linked_by: linkedBy ?? null,
        confidence: confidence ?? null,
      },
    ] as any)
    .select();

  if (error) throw error;
  return (data || []) as unknown as NexusExamRecallVariant[];
}

/**
 * Get all linked variants for a thread with thread summary.
 */
export async function getVariantsByThread(
  threadId: string,
  client?: TypedSupabaseClient
): Promise<Array<NexusExamRecallVariant & { linked_thread: Pick<NexusExamRecallThread, 'id' | 'exam_date' | 'session_number' | 'status'> }>> {
  const supabase = client || getSupabaseAdminClient();

  const { data: variants, error } = await supabase
    .from('nexus_exam_recall_variants')
    .select('*')
    .eq('thread_id', threadId);

  if (error) throw error;

  if (!variants || variants.length === 0) return [];

  const linkedIds = (variants as any[]).map((v) => v.linked_thread_id);

  const { data: threads } = await supabase
    .from('nexus_exam_recall_threads')
    .select('id, exam_date, session_number, status')
    .in('id', linkedIds);

  const threadMap = new Map((threads || []).map((t: any) => [t.id, t]));

  return (variants as any[]).map((v) => ({
    ...v,
    linked_thread: threadMap.get(v.linked_thread_id) || {
      id: v.linked_thread_id,
      exam_date: '',
      session_number: 0,
      status: 'raw',
    },
  }));
}

// ============================================
// UPLOADS
// ============================================

/**
 * Create an upload record.
 */
export async function createUpload(
  data: {
    user_id: string;
    version_id?: string | null;
    thread_id?: string | null;
    upload_type: ExamRecallUploadType;
    storage_path: string;
    original_filename: string;
    mime_type: string;
    file_size_bytes: number;
  },
  client?: TypedSupabaseClient
): Promise<NexusExamRecallUpload> {
  const supabase = client || getSupabaseAdminClient();

  const { data: upload, error } = await supabase
    .from('nexus_exam_recall_uploads')
    .insert({
      user_id: data.user_id,
      version_id: data.version_id ?? null,
      thread_id: data.thread_id ?? null,
      upload_type: data.upload_type,
      storage_path: data.storage_path,
      original_filename: data.original_filename,
      mime_type: data.mime_type,
      file_size_bytes: data.file_size_bytes,
      ocr_status: 'pending' as const,
    } as any)
    .select()
    .single();

  if (error) throw error;
  return upload as unknown as NexusExamRecallUpload;
}

/**
 * Update OCR processing result for an upload.
 */
export async function updateOCRResult(
  uploadId: string,
  data: {
    ocr_status: ExamRecallOCRStatus;
    ocr_extracted_text?: string | null;
    ocr_confidence?: number | null;
    ocr_extracted_questions?: any[] | null;
  },
  client?: TypedSupabaseClient
): Promise<NexusExamRecallUpload> {
  const supabase = client || getSupabaseAdminClient();

  const { data: updated, error } = await supabase
    .from('nexus_exam_recall_uploads')
    .update({
      ocr_status: data.ocr_status,
      ocr_extracted_text: data.ocr_extracted_text ?? null,
      ocr_confidence: data.ocr_confidence ?? null,
      ocr_extracted_questions: data.ocr_extracted_questions ?? null,
    } as any)
    .eq('id', uploadId)
    .select()
    .single();

  if (error) throw error;
  return updated as unknown as NexusExamRecallUpload;
}

// ============================================
// DASHBOARD STATS
// ============================================

/**
 * Get dashboard stats for exam recall: counts per status, total contributors,
 * and session summaries.
 */
export async function getExamRecallDashboardStats(
  classroomId: string,
  examYear?: number,
  client?: TypedSupabaseClient
): Promise<ExamRecallDashboardStats> {
  const supabase = client || getSupabaseAdminClient();

  // Build base query
  let baseQuery = supabase
    .from('nexus_exam_recall_threads')
    .select('*')
    .eq('classroom_id', classroomId);

  if (examYear) {
    baseQuery = baseQuery.eq('exam_year', examYear);
  }

  const { data: threads, error } = await baseQuery;

  if (error) throw error;

  const allThreads = (threads || []) as any[];

  // Count by status
  let pendingReview = 0;
  let published = 0;
  for (const t of allThreads) {
    if (t.status === 'under_review' || t.status === 'raw') pendingReview++;
    if (t.status === 'published') published++;
  }

  // Unique contributors
  const contributorSet = new Set(allThreads.map((t) => t.created_by));

  // Also count contributors from versions
  const threadIds = allThreads.map((t) => t.id);
  if (threadIds.length > 0) {
    const { data: versions } = await supabase
      .from('nexus_exam_recall_versions')
      .select('author_id')
      .in('thread_id', threadIds);

    for (const v of (versions || []) as any[]) {
      contributorSet.add(v.author_id);
    }
  }

  // Session summaries
  const sessionMap = new Map<string, ExamRecallSessionSummary>();
  for (const t of allThreads) {
    const key = `${t.exam_date}_${t.session_number}`;
    if (!sessionMap.has(key)) {
      sessionMap.set(key, {
        exam_date: t.exam_date,
        session_number: t.session_number,
        thread_count: 0,
        contributor_count: 0,
        published_count: 0,
        under_review_count: 0,
        raw_count: 0,
      });
    }
    const summary = sessionMap.get(key)!;
    summary.thread_count++;
    if (t.status === 'published') summary.published_count++;
    else if (t.status === 'under_review') summary.under_review_count++;
    else if (t.status === 'raw') summary.raw_count++;
  }

  // Count unique contributors per session
  for (const [key, summary] of sessionMap) {
    const [examDate, sessionNum] = key.split('_');
    const sessionThreadIds = allThreads
      .filter((t) => t.exam_date === examDate && String(t.session_number) === sessionNum)
      .map((t) => t.id);

    const sessionContributors = new Set(
      allThreads
        .filter((t) => t.exam_date === examDate && String(t.session_number) === sessionNum)
        .map((t) => t.created_by)
    );

    if (sessionThreadIds.length > 0) {
      const { data: sessionVersions } = await supabase
        .from('nexus_exam_recall_versions')
        .select('author_id')
        .in('thread_id', sessionThreadIds);

      for (const v of (sessionVersions || []) as any[]) {
        sessionContributors.add(v.author_id);
      }
    }

    summary.contributor_count = sessionContributors.size;
  }

  const sessions = [...sessionMap.values()].sort((a, b) => {
    const dateCompare = a.exam_date.localeCompare(b.exam_date);
    if (dateCompare !== 0) return dateCompare;
    return a.session_number - b.session_number;
  });

  return {
    total_threads: allThreads.length,
    pending_review: pendingReview,
    published,
    total_contributors: contributorSet.size,
    sessions,
  };
}
