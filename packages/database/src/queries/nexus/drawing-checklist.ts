// @ts-nocheck — drawing tables not yet in generated Supabase types; regenerate with pnpm supabase:gen:types
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type { DrawingChecklistItemWithProgress, DrawingObject } from '../../types';

// ============================================================
// Foundation Checklist
// ============================================================

export async function getDrawingChecklistWithProgress(
  studentId: string,
  client?: TypedSupabaseClient
): Promise<DrawingChecklistItemWithProgress[]> {
  const supabase = client || getSupabaseAdminClient();

  // Get all items
  const { data: items, error: itemsErr } = await supabase
    .from('drawing_checklist_items' as any)
    .select('*')
    .order('sort_order', { ascending: true });

  if (itemsErr) throw itemsErr;

  // Get student progress
  const { data: progress } = await supabase
    .from('drawing_checklist_progress' as any)
    .select('*')
    .eq('student_id', studentId);

  const progressMap = new Map((progress || []).map((p: any) => [p.checklist_item_id, p]));

  return (items || []).map((item: any) => ({
    ...item,
    progress: progressMap.get(item.id) || null,
  }));
}

export async function updateDrawingChecklistProgress(
  studentId: string,
  itemId: string,
  status: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  const { error } = await supabase
    .from('drawing_checklist_progress' as any)
    .upsert({
      student_id: studentId,
      checklist_item_id: itemId,
      status,
      student_marked_at: status !== 'not_started' ? new Date().toISOString() : null,
    }, {
      onConflict: 'student_id,checklist_item_id',
    });

  if (error) throw error;
}

export async function getDrawingChecklistHeatmap(
  client?: TypedSupabaseClient
): Promise<Record<string, { total: number; completed: number; percentage: number }>> {
  const supabase = client || getSupabaseAdminClient();

  const { data: items } = await supabase
    .from('drawing_checklist_items' as any)
    .select('id, category');

  const { data: progress } = await supabase
    .from('drawing_checklist_progress' as any)
    .select('checklist_item_id, status')
    .eq('status', 'completed');

  const categoryItems: Record<string, number> = {};
  for (const item of items || []) {
    categoryItems[(item as any).category] = (categoryItems[(item as any).category] || 0) + 1;
  }

  const completedByCategory: Record<string, Set<string>> = {};
  for (const p of progress || []) {
    const item = (items || []).find((i: any) => i.id === (p as any).checklist_item_id);
    if (item) {
      const cat = (item as any).category;
      if (!completedByCategory[cat]) completedByCategory[cat] = new Set();
      completedByCategory[cat].add((p as any).checklist_item_id);
    }
  }

  const result: Record<string, { total: number; completed: number; percentage: number }> = {};
  for (const [cat, total] of Object.entries(categoryItems)) {
    const completed = completedByCategory[cat]?.size || 0;
    result[cat] = { total, completed, percentage: Math.round((completed / total) * 100) };
  }

  return result;
}

export async function verifyDrawingChecklistItem(
  studentId: string,
  itemId: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  const { error } = await supabase
    .from('drawing_checklist_progress' as any)
    .upsert({
      student_id: studentId,
      checklist_item_id: itemId,
      status: 'completed',
      tutor_verified: true,
      tutor_verified_at: new Date().toISOString(),
    }, {
      onConflict: 'student_id,checklist_item_id',
    });

  if (error) throw error;
}

// ============================================================
// Object Library
// ============================================================

export async function getDrawingObjects(
  filters?: {
    family?: string;
    difficulty?: string;
    search?: string;
    limit?: number;
    offset?: number;
  },
  client?: TypedSupabaseClient
): Promise<{ data: DrawingObject[]; count: number }> {
  const supabase = client || getSupabaseAdminClient();

  let query = supabase
    .from('drawing_objects' as any)
    .select('*', { count: 'exact' })
    .eq('is_active', true)
    .order('family', { ascending: true })
    .order('difficulty', { ascending: true })
    .order('object_name', { ascending: true });

  if (filters?.family) query = query.eq('family', filters.family);
  if (filters?.difficulty) query = query.eq('difficulty', filters.difficulty);
  if (filters?.search) query = query.ilike('object_name', `%${filters.search}%`);

  const limit = filters?.limit || 100;
  const offset = filters?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: (data as DrawingObject[]) || [], count: count || 0 };
}

export async function getDrawingObjectById(
  id: string,
  client?: TypedSupabaseClient
): Promise<DrawingObject | null> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('drawing_objects' as any)
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data as DrawingObject;
}
