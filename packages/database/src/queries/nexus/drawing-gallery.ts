import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type { GalleryPost, GalleryReactionType, DrawingHomework, DrawingHomeworkWithStatus } from '../../types';

// ============================================================
// Gallery Feed
// ============================================================

export async function getGalleryFeed(
  userId: string,
  filters?: { category?: string; limit?: number; offset?: number },
  client?: TypedSupabaseClient
): Promise<GalleryPost[]> {
  const supabase = client || getSupabaseAdminClient();

  let query = supabase
    .from('drawing_submissions')
    .select('*, question:drawing_questions(*), student:users!drawing_submissions_student_id_fkey(id, name, email, avatar_url)')
    .eq('is_gallery_published', true)
    .order('reviewed_at', { ascending: false });

  const limit = filters?.limit || 20;
  const offset = filters?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data: submissions, error } = await query;
  if (error) throw error;

  if (!submissions || submissions.length === 0) return [];

  const subIds = submissions.map((s: any) => s.id);

  // Get reaction counts
  const { data: reactions } = await supabase
    .from('drawing_gallery_reactions')
    .select('submission_id, reaction_type')
    .in('submission_id', subIds);

  // Get user's own reactions
  const { data: userReactions } = await supabase
    .from('drawing_gallery_reactions')
    .select('submission_id, reaction_type')
    .eq('user_id', userId)
    .in('submission_id', subIds);

  // Get comment counts
  const { data: comments } = await supabase
    .from('drawing_submission_comments')
    .select('submission_id')
    .in('submission_id', subIds);

  // Build maps
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

  // Filter by category if needed
  let results = submissions as any[];
  if (filters?.category) {
    results = results.filter((s: any) => s.question?.category === filters.category);
  }

  return results.map((s: any) => ({
    ...s,
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

  // Check if exists
  const { data: existing } = await supabase
    .from('drawing_gallery_reactions')
    .select('id')
    .eq('submission_id', submissionId)
    .eq('user_id', userId)
    .eq('reaction_type', reactionType)
    .single();

  if (existing) {
    await supabase.from('drawing_gallery_reactions').delete().eq('id', existing.id);
    return { added: false };
  }

  await supabase.from('drawing_gallery_reactions').insert({
    submission_id: submissionId,
    user_id: userId,
    reaction_type: reactionType,
  });
  return { added: true };
}

export async function publishToGallery(
  submissionId: string,
  publish: boolean,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  await supabase
    .from('drawing_submissions')
    .update({ is_gallery_published: publish, status: publish ? 'published' : 'completed' })
    .eq('id', submissionId);
}

// ============================================================
// Drawing Homework
// ============================================================

export async function createDrawingHomework(
  data: Omit<DrawingHomework, 'id' | 'created_at'>,
  client?: TypedSupabaseClient
): Promise<DrawingHomework> {
  const supabase = client || getSupabaseAdminClient();
  const { data: hw, error } = await supabase
    .from('drawing_homework')
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
    .from('drawing_homework')
    .select('*')
    .order('due_date', { ascending: true });

  const { data: homework, error } = await query;
  if (error) throw error;

  // For students, filter to assigned homework
  let filtered = homework || [];
  if (role === 'student') {
    filtered = filtered.filter((hw: any) =>
      hw.assigned_to === 'all_students' || (hw.student_ids || []).includes(userId)
    );
  }

  // Get submission counts per homework
  const hwIds = filtered.map((hw: any) => hw.id);
  const { data: submissions } = await supabase
    .from('drawing_submissions')
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
    .from('drawing_homework')
    .select('*')
    .eq('id', id)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data as DrawingHomework;
}
