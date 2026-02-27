/**
 * Centers Queries
 *
 * Query functions for offline_centers table.
 */

import type { TypedSupabaseClient } from '../client';
import { getSupabaseAdminClient } from '../client';
import type { OfflineCenter } from '../types';

/**
 * Get the headquarters center
 */
export async function getHeadquarters(
  client?: TypedSupabaseClient
): Promise<OfflineCenter | null> {
  const supabase = client ?? getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('offline_centers')
    .select('*')
    .eq('center_type', 'headquarters')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
  return (data as OfflineCenter) ?? null;
}

/**
 * Get all active sub-office centers
 */
export async function getSubOffices(
  client?: TypedSupabaseClient
): Promise<OfflineCenter[]> {
  const supabase = client ?? getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('offline_centers')
    .select('*')
    .eq('center_type', 'sub_office')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) throw error;
  return (data ?? []) as OfflineCenter[];
}

/**
 * Get a center by its SEO slug
 */
export async function getCenterBySeoSlug(
  seoSlug: string,
  client?: TypedSupabaseClient
): Promise<OfflineCenter | null> {
  const supabase = client ?? getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('offline_centers')
    .select('*')
    .eq('seo_slug', seoSlug)
    .eq('is_active', true)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return (data as OfflineCenter) ?? null;
}

/**
 * Get all active centers (HQ + sub-offices)
 */
export async function getAllActiveCenters(
  client?: TypedSupabaseClient
): Promise<OfflineCenter[]> {
  const supabase = client ?? getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('offline_centers')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) throw error;
  return (data ?? []) as OfflineCenter[];
}

/**
 * Get all SEO slugs for static generation
 */
export async function getAllCenterSeoSlugs(
  client?: TypedSupabaseClient
): Promise<string[]> {
  const supabase = client ?? getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('offline_centers')
    .select('seo_slug')
    .eq('is_active', true)
    .not('seo_slug', 'is', null);

  if (error) throw error;
  return (data ?? []).map((d: { seo_slug: string }) => d.seo_slug);
}
