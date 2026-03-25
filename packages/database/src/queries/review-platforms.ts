// @ts-nocheck - Supabase types not generated
/**
 * Neram Classes - Review Platform URL Queries
 *
 * CRUD for review platform URLs (Google, Sulekha, JustDial) per center.
 * Admin-configurable via Nexus settings page.
 */

import { getSupabaseAdminClient } from '../client';
import type { ReviewPlatformUrl, ReviewPlatform } from '../types';

/**
 * Get all review platform URLs, optionally filtered by center.
 */
export async function getReviewPlatformUrls(centerId?: string): Promise<ReviewPlatformUrl[]> {
  const supabase = getSupabaseAdminClient();

  let query = supabase
    .from('review_platform_urls')
    .select('*')
    .eq('is_active', true)
    .order('platform', { ascending: true });

  if (centerId) {
    query = query.eq('center_id', centerId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Failed to get review platform URLs:', error);
    return [];
  }

  return (data || []) as ReviewPlatformUrl[];
}

/**
 * Get review URL for a specific center + platform.
 */
export async function getReviewUrl(
  centerId: string,
  platform: ReviewPlatform
): Promise<string | null> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('review_platform_urls')
    .select('review_url')
    .eq('center_id', centerId)
    .eq('platform', platform)
    .eq('is_active', true)
    .single();

  if (error || !data) return null;
  return data.review_url;
}

/**
 * Create or update a review platform URL.
 */
export async function upsertReviewPlatformUrl(input: {
  center_id: string;
  platform: ReviewPlatform;
  review_url: string;
  display_name?: string;
}): Promise<{ url: ReviewPlatformUrl | null; error: string | null }> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('review_platform_urls')
    .upsert({
      center_id: input.center_id,
      platform: input.platform,
      review_url: input.review_url,
      display_name: input.display_name || null,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'center_id,platform' })
    .select()
    .single();

  if (error) {
    console.error('Failed to upsert review platform URL:', error);
    return { url: null, error: 'Failed to save platform URL.' };
  }

  return { url: data as ReviewPlatformUrl, error: null };
}

/**
 * Delete (soft) a review platform URL.
 */
export async function deleteReviewPlatformUrl(id: string): Promise<{ success: boolean }> {
  const supabase = getSupabaseAdminClient();

  const { error } = await supabase
    .from('review_platform_urls')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('Failed to delete review platform URL:', error);
    return { success: false };
  }

  return { success: true };
}

/**
 * Get all platform URLs grouped by center (for admin overview).
 */
export async function getAllPlatformUrlsWithCenters(): Promise<
  Array<ReviewPlatformUrl & { center_name: string | null; center_city: string | null }>
> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('review_platform_urls')
    .select(`
      *,
      center:offline_centers!review_platform_urls_center_id_fkey(name, city)
    `)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to get platform URLs with centers:', error);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    center_id: row.center_id,
    platform: row.platform,
    review_url: row.review_url,
    display_name: row.display_name,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
    center_name: row.center?.name || null,
    center_city: row.center?.city || null,
  }));
}
