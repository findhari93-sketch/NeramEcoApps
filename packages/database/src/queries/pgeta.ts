// @ts-nocheck - Database type needs regeneration for Supabase v2 compat
/**
 * Neram Classes - PGETA 2026 Content Queries
 *
 * Public queries for the marketing PGETA hub + spoke pages.
 * PGETA = Post Graduate Entrance Test in Architecture (COA).
 * The page also captures PGEAT search intent; data tables and queries use
 * the canonical name (pgeta_*).
 *
 * Tables: pgeta_brochures, pgeta_faqs, pgeta_banners
 * (migration 20260501000000_aat_pgeta_content_tables.sql).
 */

import { getSupabaseBrowserClient, TypedSupabaseClient } from '../client';
import type { PgetaBrochure, PgetaFaq, PgetaBanner } from '../types';

export async function getActivePgetaBrochures(
  year?: number,
  client?: TypedSupabaseClient
): Promise<PgetaBrochure[]> {
  const supabase = client || getSupabaseBrowserClient();

  let query = supabase
    .from('pgeta_brochures')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (year) {
    query = query.eq('year', year);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching pgeta brochures:', error);
    return [];
  }
  return data || [];
}

export async function getActivePgetaFaqs(
  options: {
    category?: string;
    pageSlug?: string;
    year?: number;
  } = {},
  client?: TypedSupabaseClient
): Promise<PgetaFaq[]> {
  const supabase = client || getSupabaseBrowserClient();

  let query = supabase
    .from('pgeta_faqs')
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
    console.error('Error fetching pgeta faqs:', error);
    return [];
  }
  return data || [];
}

export async function getActivePgetaBanners(
  spot?: string,
  client?: TypedSupabaseClient
): Promise<PgetaBanner[]> {
  const supabase = client || getSupabaseBrowserClient();
  const now = new Date().toISOString();

  let query = supabase
    .from('pgeta_banners')
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
    console.error('Error fetching pgeta banners:', error);
    return [];
  }
  return data || [];
}
