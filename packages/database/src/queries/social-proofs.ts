// @ts-nocheck - Database type needs regeneration for Supabase v2 compat
/**
 * Neram Classes - Social Proofs Queries
 *
 * Database queries for media testimonials (video, audio, screenshots).
 * Separate from text-based testimonials.
 */

import { getSupabaseBrowserClient, getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import type { SocialProof, SocialProofType, SocialProofLanguage } from '../types';

// ============================================
// PUBLIC QUERIES (for marketing site)
// ============================================

/**
 * Get social proofs marked for homepage display.
 */
export async function getHomepageSocialProofs(
  client?: TypedSupabaseClient
): Promise<SocialProof[]> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('social_proofs')
    .select('*')
    .eq('is_homepage', true)
    .eq('is_active', true)
    .order('proof_type', { ascending: true })
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching homepage social proofs:', error);
    return [];
  }

  return (data || []) as SocialProof[];
}

/**
 * Get social proofs filtered by type with pagination.
 */
export async function getSocialProofsByType(
  proofType: SocialProofType,
  options: {
    language?: SocialProofLanguage;
    limit?: number;
    offset?: number;
  } = {},
  client?: TypedSupabaseClient
): Promise<{ data: SocialProof[]; count: number }> {
  const supabase = client || getSupabaseBrowserClient();

  let query = supabase
    .from('social_proofs')
    .select('*', { count: 'exact' })
    .eq('is_active', true)
    .eq('proof_type', proofType);

  if (options.language) query = query.eq('language', options.language);

  query = query.order('display_order', { ascending: true });

  const limit = options.limit || 12;
  const offset = options.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching social proofs:', error);
    return { data: [], count: 0 };
  }

  return { data: (data || []) as SocialProof[], count: count || 0 };
}

// ============================================
// ADMIN QUERIES
// ============================================

/**
 * Get a single social proof by ID (admin).
 */
export async function getSocialProofById(
  id: string,
  client?: TypedSupabaseClient
): Promise<SocialProof | null> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('social_proofs')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching social proof:', error);
    return null;
  }

  return data as SocialProof;
}

/**
 * List all social proofs for admin (includes inactive).
 */
export async function listSocialProofsAdmin(
  options: {
    search?: string;
    proof_type?: SocialProofType;
    language?: SocialProofLanguage;
    is_active?: boolean;
    limit?: number;
    offset?: number;
  } = {},
  client?: TypedSupabaseClient
): Promise<{ data: SocialProof[]; count: number }> {
  const supabase = client || getSupabaseAdminClient();

  let query = supabase
    .from('social_proofs')
    .select('*', { count: 'exact' });

  if (options.is_active !== undefined) query = query.eq('is_active', options.is_active);
  if (options.proof_type) query = query.eq('proof_type', options.proof_type);
  if (options.language) query = query.eq('language', options.language);
  if (options.search) query = query.or(`speaker_name.ilike.%${options.search}%,student_name.ilike.%${options.search}%`);

  query = query.order('created_at', { ascending: false });

  const limit = options.limit || 50;
  const offset = options.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('Error listing social proofs:', error);
    return { data: [], count: 0 };
  }

  return { data: (data || []) as SocialProof[], count: count || 0 };
}

/**
 * Get aggregate stats for social proofs.
 */
export async function getSocialProofStats(
  client?: TypedSupabaseClient
): Promise<{
  total: number;
  videoCount: number;
  audioCount: number;
  screenshotCount: number;
  featuredCount: number;
}> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error, count } = await supabase
    .from('social_proofs')
    .select('proof_type, is_featured', { count: 'exact' })
    .eq('is_active', true);

  if (error || !data) {
    return { total: 0, videoCount: 0, audioCount: 0, screenshotCount: 0, featuredCount: 0 };
  }

  return {
    total: count || 0,
    videoCount: data.filter((d: { proof_type: string }) => d.proof_type === 'video').length,
    audioCount: data.filter((d: { proof_type: string }) => d.proof_type === 'audio').length,
    screenshotCount: data.filter((d: { proof_type: string }) => d.proof_type === 'screenshot').length,
    featuredCount: data.filter((d: { is_featured: boolean }) => d.is_featured).length,
  };
}

/**
 * Create a new social proof (admin).
 */
export async function createSocialProof(
  input: Omit<SocialProof, 'id' | 'created_at' | 'updated_at'>,
  client?: TypedSupabaseClient
): Promise<SocialProof | null> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('social_proofs')
    .insert(input)
    .select()
    .single();

  if (error) {
    console.error('Error creating social proof:', error);
    return null;
  }

  return data as SocialProof;
}

/**
 * Update a social proof (admin).
 */
export async function updateSocialProof(
  id: string,
  updates: Partial<Omit<SocialProof, 'id' | 'created_at' | 'updated_at'>>,
  client?: TypedSupabaseClient
): Promise<SocialProof | null> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('social_proofs')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating social proof:', error);
    return null;
  }

  return data as SocialProof;
}

/**
 * Soft-delete a social proof (set is_active = false).
 */
export async function deleteSocialProof(
  id: string,
  client?: TypedSupabaseClient
): Promise<boolean> {
  const supabase = client || getSupabaseAdminClient();

  const { error } = await supabase
    .from('social_proofs')
    .update({ is_active: false })
    .eq('id', id);

  if (error) {
    console.error('Error deleting social proof:', error);
    return false;
  }

  return true;
}
