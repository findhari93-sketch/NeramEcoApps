// @ts-nocheck — drawing tables not yet in generated Supabase types; regenerate with pnpm supabase:gen:types
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type { GalleryPost, GalleryReactionType, DrawingHomework, DrawingHomeworkWithStatus, DrawingTag } from '../../types';

// ============================================================
// Gallery Feed
// ============================================================

export async function getGalleryFeed(
  userId: string,
  filters?: { tagSlugs?: string[]; limit?: number; offset?: number },
  client?: TypedSupabaseClient
): Promise<GalleryPost[]> {
  const supabase = client || getSupabaseAdminClient();

  // If tags are requested, resolve them first so we can restrict submission_ids.
  let tagRestrictedIds: string[] | null = null;
  if (filters?.tagSlugs && filters.tagSlugs.length > 0) {
    const { data: tagRows } = await supabase
      .from('drawing_tags' as any)
      .select('id, slug')
      .in('slug', filters.tagSlugs);
    const tagIds = (tagRows || []).map((t: any) => t.id);
    if (tagIds.length === 0) return [];

    const { data: links } = await supabase
      .from('drawing_submission_tags' as any)
      .select('submission_id')
      .in('tag_id', tagIds);
    tagRestrictedIds = [...new Set((links || []).map((l: any) => l.submission_id))];
    if (tagRestrictedIds.length === 0) return [];
  }

  let query = supabase
    .from('drawing_submissions' as any)
    .select('*, question:drawing_questions(*), student:users!drawing_submissions_student_id_fkey(id, name, email, avatar_url)')
    .eq('is_gallery_visible', true)
    .not('tutor_feedback', 'is', null)
    .not('tutor_rating', 'is', null)
    .order('reviewed_at', { ascending: false });

  if (tagRestrictedIds) {
    query = query.in('id', tagRestrictedIds);
  }

  const limit = filters?.limit || 20;
  const offset = filters?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data: submissions, error } = await query;
  if (error) throw error;

  if (!submissions || submissions.length === 0) return [];

  const subIds = submissions.map((s: any) => s.id);

  // Batch-fetch tags for these submissions
  const { data: tagLinks } = await supabase
    .from('drawing_submission_tags' as any)
    .select('submission_id, tag:drawing_tags(*)')
    .in('submission_id', subIds);

  const tagsBySubmission: Record<string, DrawingTag[]> = {};
  for (const link of (tagLinks || []) as any[]) {
    const sid = link.submission_id;
    if (!tagsBySubmission[sid]) tagsBySubmission[sid] = [];
    if (link.tag) tagsBySubmission[sid].push(link.tag as DrawingTag);
  }

  // Reactions and comments (unchanged)
  const { data: reactions } = await supabase
    .from('drawing_gallery_reactions' as any)
    .select('submission_id, reaction_type')
    .in('submission_id', subIds);

  const { data: userReactions } = await supabase
    .from('drawing_gallery_reactions' as any)
    .select('submission_id, reaction_type')
    .eq('user_id', userId)
    .in('submission_id', subIds);

  const { data: comments } = await supabase
    .from('drawing_submission_comments' as any)
    .select('submission_id')
    .in('submission_id', subIds);

  const reactionCounts: Record<string, Record<string, number>> = {};
  for (const r of reactions || []) {
    const key = (r as any).submission_id;
    if (!reactionCounts[key]) reactionCounts[key] = {};
    reactionCounts[key][(r as any).reaction_type] = (reactionCounts[key][(r as any).reaction_type] || 0) + 1;
  }

  const userReactionMap: Record<string, string[]> = {};
  for (const r of userReactions || []) {
    const key = (r as any).submission_id;
    if (!userReactionMap[key]) userReactionMap[key] = [];
    userReactionMap[key].push((r as any).reaction_type);
  }

  const commentCounts: Record<string, number> = {};
  for (const c of comments || []) {
    const key = (c as any).submission_id;
    commentCounts[key] = (commentCounts[key] || 0) + 1;
  }

  return (submissions as any[]).map((s: any) => ({
    ...s,
    tags: tagsBySubmission[s.id] || [],
    reactions: {
      heart: reactionCounts[s.id]?.heart || 0,
      clap: reactionCounts[s.id]?.clap || 0,
      fire: reactionCounts[s.id]?.fire || 0,
      star: reactionCounts[s.id]?.star || 0,
      wow: reactionCounts[s.id]?.wow || 0,
    },
    user_reactions: userReactionMap[s.id] || [],
    comment_count: commentCounts[s.id] || 0,
  }));
}

export async function toggleGalleryReaction(
  submissionId: string,
  userId: string,
  reactionType: GalleryReactionType,
  client?: TypedSupabaseClient
): Promise<{ added: boolean }> {
  const supabase = client || getSupabaseAdminClient();

  const { data: existing } = await supabase
    .from('drawing_gallery_reactions' as any)
    .select('id')
    .eq('submission_id', submissionId)
    .eq('user_id', userId)
    .eq('reaction_type', reactionType)
    .single();

  if (existing) {
    await supabase.from('drawing_gallery_reactions' as any).delete().eq('id', existing.id);
    return { added: false };
  }

  await supabase.from('drawing_gallery_reactions' as any).insert({
    submission_id: submissionId,
    user_id: userId,
    reaction_type: reactionType,
  });
  return { added: true };
}

/**
 * Toggle whether a submission shows in the unified gallery.
 * Only flips the visibility flag — the review lifecycle `status` is untouched,
 * so the submission remains in its Completed / Reviewed / Redo bucket.
 */
export async function setGalleryVisibility(
  submissionId: string,
  visible: boolean,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  await supabase
    .from('drawing_submissions' as any)
    .update({ is_gallery_visible: visible })
    .eq('id', submissionId);
}

// Backwards-compatible alias; kept so no caller breaks during the rollout.
export const publishToGallery = setGalleryVisibility;

// ============================================================
// Drawing Homework
// ============================================================

export async function createDrawingHomework(
  data: Omit<DrawingHomework, 'id' | 'created_at'>,
  client?: TypedSupabaseClient
): Promise<DrawingHomework> {
  const supabase = client || getSupabaseAdminClient();
  const { data: hw, error } = await supabase
    .from('drawing_homework' as any)
    .insert(data)
    .select('*')
    .single();
  if (error) throw error;
  return hw as DrawingHomework;
}

export async function getDrawingHomeworkList(
  userId: string,
  role: 'student' | 'teacher',
  client?: TypedSupabaseClient
): Promise<DrawingHomeworkWithStatus[]> {
  const supabase = client || getSupabaseAdminClient();

  const query = supabase
    .from('drawing_homework' as any)
    .select('*')
    .order('due_date', { ascending: true });

  const { data: homework, error } = await query;
  if (error) throw error;

  let filtered = homework || [];
  if (role === 'student') {
    filtered = filtered.filter((hw: any) =>
      hw.assigned_to === 'all_students' || (hw.student_ids || []).includes(userId)
    );
  }

  const hwIds = filtered.map((hw: any) => hw.id);
  const { data: submissions } = await supabase
    .from('drawing_submissions' as any)
    .select('homework_id, student_id')
    .in('homework_id', hwIds.length > 0 ? hwIds : ['none']);

  const submissionCounts: Record<string, number> = {};
  const mySubmissions: Record<string, string> = {};
  for (const s of submissions || []) {
    const hwId = (s as any).homework_id;
    submissionCounts[hwId] = (submissionCounts[hwId] || 0) + 1;
    if ((s as any).student_id === userId) mySubmissions[hwId] = (s as any).id;
  }

  return filtered.map((hw: any) => ({
    ...hw,
    submission_count: submissionCounts[hw.id] || 0,
    my_submission_id: mySubmissions[hw.id] || null,
  }));
}

export async function getDrawingHomeworkById(
  id: string,
  client?: TypedSupabaseClient
): Promise<DrawingHomework | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('drawing_homework' as any)
    .select('*')
    .eq('id', id)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data as DrawingHomework;
}
