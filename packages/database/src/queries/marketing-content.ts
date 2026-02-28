// @ts-nocheck - Database type needs regeneration for Supabase v2 compat
/**
 * Neram Classes - Marketing Content Queries
 *
 * Database queries for dynamic content on the marketing website.
 * Admin creates/manages content, marketing site displays it.
 */

import { getSupabaseBrowserClient, getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import type {
  MarketingContent,
  MarketingContentType,
  MarketingContentStatus,
  CreateMarketingContentInput,
} from '../types';

// ============================================
// PUBLIC QUERIES (for marketing site)
// ============================================

/**
 * Get published marketing content, optionally filtered by type.
 * Automatically filters out expired and not-yet-started content.
 */
export async function getPublishedMarketingContent(
  options: {
    type?: MarketingContentType;
    limit?: number;
    offset?: number;
    pinnedOnly?: boolean;
  } = {},
  client?: TypedSupabaseClient
): Promise<MarketingContent[]> {
  const supabase = client || getSupabaseBrowserClient();
  const now = new Date().toISOString();

  let query = supabase
    .from('marketing_content')
    .select('*')
    .eq('status', 'published')
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`expires_at.is.null,expires_at.gte.${now}`);

  if (options.type) {
    query = query.eq('type', options.type);
  }

  if (options.pinnedOnly) {
    query = query.eq('is_pinned', true);
  }

  query = query
    .order('is_pinned', { ascending: false })
    .order('display_priority', { ascending: false })
    .order('published_at', { ascending: false });

  if (options.limit) {
    const offset = options.offset || 0;
    query = query.range(offset, offset + options.limit - 1);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching marketing content:', error);
    return [];
  }

  return data || [];
}

/**
 * Get published achievements filtered by academic year.
 * Used on the dedicated /achievements page.
 */
export async function getAchievementsByAcademicYear(
  academicYear?: string,
  client?: TypedSupabaseClient
): Promise<MarketingContent[]> {
  const supabase = client || getSupabaseBrowserClient();

  let query = supabase
    .from('marketing_content')
    .select('*')
    .eq('status', 'published')
    .eq('type', 'achievement');

  if (academicYear) {
    query = query.contains('metadata', { academic_year: academicYear });
  }

  query = query
    .order('display_priority', { ascending: false })
    .order('published_at', { ascending: false });

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching achievements:', error);
    return [];
  }

  return data || [];
}

/**
 * Get distinct academic years from published achievements.
 */
export async function getAchievementAcademicYears(
  client?: TypedSupabaseClient
): Promise<string[]> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('marketing_content')
    .select('metadata')
    .eq('status', 'published')
    .eq('type', 'achievement');

  if (error) {
    console.error('Error fetching academic years:', error);
    return [];
  }

  const years = new Set<string>();
  (data || []).forEach((item: { metadata: Record<string, unknown> }) => {
    const year = item.metadata?.academic_year as string;
    if (year) years.add(year);
  });

  return Array.from(years).sort().reverse();
}

// ============================================
// ADMIN QUERIES (all statuses, full CRUD)
// ============================================

/**
 * List all marketing content (admin - includes drafts and archived)
 */
export async function listMarketingContent(
  options: {
    type?: MarketingContentType;
    status?: MarketingContentStatus;
  } = {},
  client?: TypedSupabaseClient
): Promise<MarketingContent[]> {
  const supabase = client || getSupabaseAdminClient();

  let query = supabase
    .from('marketing_content')
    .select('*');

  if (options.type) {
    query = query.eq('type', options.type);
  }

  if (options.status) {
    query = query.eq('status', options.status);
  }

  query = query
    .order('display_priority', { ascending: false })
    .order('created_at', { ascending: false });

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

/**
 * Create marketing content (admin)
 */
export async function createMarketingContent(
  input: CreateMarketingContentInput,
  client?: TypedSupabaseClient
): Promise<MarketingContent> {
  const supabase = client || getSupabaseAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Database type needs regeneration
  const { data, error } = await (supabase as any)
    .from('marketing_content')
    .insert(input)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create marketing content: ${error.message}`);
  }
  return data as MarketingContent;
}

/**
 * Update marketing content (admin)
 */
export async function updateMarketingContent(
  id: string,
  updates: Partial<Omit<MarketingContent, 'id' | 'created_at' | 'updated_at'>>,
  client?: TypedSupabaseClient
): Promise<MarketingContent> {
  const supabase = client || getSupabaseAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Database type needs regeneration
  const { data, error } = await (supabase as any)
    .from('marketing_content')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update marketing content ${id}: ${error.message}`);
  }
  return data as MarketingContent;
}

/**
 * Delete marketing content (admin)
 */
export async function deleteMarketingContent(
  id: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  const { error } = await supabase
    .from('marketing_content')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to delete marketing content ${id}: ${error.message}`);
  }
}
