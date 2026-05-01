// @ts-nocheck - Database type needs regeneration for Supabase v2 compat
/**
 * Neram Classes - AAT 2026 Content Queries
 *
 * Public queries for the marketing AAT hub + spoke pages.
 * Tables: aat_brochures, aat_faqs, aat_banners (created in
 * migration 20260501000000_aat_pgeta_content_tables.sql).
 *
 * Schema mirrors nata_* exactly, so query shape matches getActiveNata*().
 */

import { getSupabaseBrowserClient, TypedSupabaseClient } from '../client';
import type { AatBrochure, AatFaq, AatBanner } from '../types';

export async function getActiveAatBrochures(
  year?: number,
  client?: TypedSupabaseClient
): Promise<AatBrochure[]> {
  const supabase = client || getSupabaseBrowserClient();

  let query = supabase
    .from('aat_brochures')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (year) {
    query = query.eq('year', year);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching aat brochures:', error);
    return [];
  }
  return data || [];
}

export async function getActiveAatFaqs(
  options: {
    category?: string;
    pageSlug?: string;
    year?: number;
  } = {},
  client?: TypedSupabaseClient
): Promise<AatFaq[]> {
  const supabase = client || getSupabaseBrowserClient();

  let query = supabase
    .from('aat_faqs')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (options.category) {
    query = query.eq('category', options.category);
  }

  if (options.pageSlug) {
    query = query.eq('page_slug', options.pageSlug);
  }

  if (options.year) {
    query = query.eq('year', options.year);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching aat faqs:', error);
    return [];
  }
  return data || [];
}

export async function getActiveAatBanners(
  spot?: string,
  client?: TypedSupabaseClient
): Promise<AatBanner[]> {
  const supabase = client || getSupabaseBrowserClient();
  const now = new Date().toISOString();

  let query = supabase
    .from('aat_banners')
    .select('*')
    .eq('is_active', true)
    .or(`start_date.is.null,start_date.lte.${now}`)
    .or(`end_date.is.null,end_date.gte.${now}`)
    .order('display_order', { ascending: true });

  if (spot) {
    query = query.eq('spot', spot);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching aat banners:', error);
    return [];
  }
  return data || [];
}
