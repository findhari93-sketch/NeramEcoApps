// @ts-nocheck — drawing_reference_images not yet in generated Supabase types; regenerate with pnpm supabase:gen:types
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type { DrawingReferenceImage } from '../../types';

// ============================================================
// Teacher Reference Library
// ============================================================

/**
 * List reference images for the Reference Library. Defaults to active only;
 * staff may pass includeInactive to audit archived ones. Filter by category
 * and/or a single tag.
 */
export async function listReferenceImages(
  filters?: { category?: string; tag?: string; includeInactive?: boolean },
  client?: TypedSupabaseClient,
): Promise<DrawingReferenceImage[]> {
  const supabase = client || getSupabaseAdminClient();
  let query = supabase
    .from('drawing_reference_images' as any)
    .select('*')
    .order('created_at', { ascending: false });

  if (!filters?.includeInactive) query = query.eq('is_active', true);
  if (filters?.category) query = query.eq('category', filters.category);
  if (filters?.tag) query = query.contains('tags', [filters.tag]);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as DrawingReferenceImage[];
}

export async function createReferenceImage(
  data: { title: string; category?: string | null; tags?: string[]; image_url: string; notes?: string | null; uploaded_by?: string | null },
  client?: TypedSupabaseClient,
): Promise<DrawingReferenceImage> {
  const supabase = client || getSupabaseAdminClient();
  const { data: row, error } = await supabase
    .from('drawing_reference_images' as any)
    .insert({
      title: data.title,
      category: data.category || null,
      tags: data.tags || [],
      image_url: data.image_url,
      notes: data.notes || null,
      uploaded_by: data.uploaded_by || null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return row as DrawingReferenceImage;
}

/** Soft-delete: archived references drop out of the library but are recoverable. */
export async function archiveReferenceImage(id: string, client?: TypedSupabaseClient): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase
    .from('drawing_reference_images' as any)
    .update({ is_active: false })
    .eq('id', id);
  if (error) throw error;
}
