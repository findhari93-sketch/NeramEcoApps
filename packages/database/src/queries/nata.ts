// @ts-nocheck - Database type needs regeneration for Supabase v2 compat
/**
 * Neram Classes - NATA 2026 Content Queries
 *
 * Public queries for marketing/tools apps + Admin CRUD queries.
 * Tables: nata_brochures, nata_faqs, nata_announcements, nata_banners, nata_assistance_requests
 */

import { getSupabaseBrowserClient, getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import type {
  NataBrochure,
  NataFaq,
  NataAnnouncement,
  NataBanner,
  NataAssistanceRequest,
  CreateNataAssistanceRequestInput,
} from '../types';

// ============================================
// PUBLIC QUERIES — Brochures
// ============================================

export async function getActiveNataBrochures(
  year?: number,
  client?: TypedSupabaseClient
): Promise<NataBrochure[]> {
  const supabase = client || getSupabaseBrowserClient();

  let query = supabase
    .from('nata_brochures')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (year) {
    query = query.eq('year', year);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching nata brochures:', error);
    return [];
  }
  return data || [];
}

export async function incrementBrochureDownloadCount(
  id: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  const { error } = await supabase.rpc('increment_counter', {
    table_name: 'nata_brochures',
    row_id: id,
    column_name: 'download_count',
  }).catch(() => {
    // Fallback: manual increment
    return supabase
      .from('nata_brochures')
      .update({ download_count: supabase.rpc ? undefined : 1 })
      .eq('id', id);
  });

  // Simple fallback if rpc doesn't exist
  if (error) {
    const { data } = await (supabase as any)
      .from('nata_brochures')
      .select('download_count')
      .eq('id', id)
      .single();

    if (data) {
      await (supabase as any)
        .from('nata_brochures')
        .update({ download_count: (data.download_count || 0) + 1 })
        .eq('id', id);
    }
  }
}

// ============================================
// PUBLIC QUERIES — FAQs
// ============================================

export async function getActiveNataFaqs(
  options: {
    category?: string;
    pageSlug?: string;
    year?: number;
  } = {},
  client?: TypedSupabaseClient
): Promise<NataFaq[]> {
  const supabase = client || getSupabaseBrowserClient();

  let query = supabase
    .from('nata_faqs')
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
    console.error('Error fetching nata faqs:', error);
    return [];
  }
  return data || [];
}

// ============================================
// PUBLIC QUERIES — Announcements
// ============================================

export async function getActiveNataAnnouncements(
  year?: number,
  client?: TypedSupabaseClient
): Promise<NataAnnouncement[]> {
  const supabase = client || getSupabaseBrowserClient();
  const now = new Date().toISOString();

  let query = supabase
    .from('nata_announcements')
    .select('*')
    .eq('is_active', true)
    .or(`start_date.is.null,start_date.lte.${now}`)
    .or(`end_date.is.null,end_date.gte.${now}`)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false });

  if (year) {
    query = query.eq('year', year);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching nata announcements:', error);
    return [];
  }
  return data || [];
}

// ============================================
// PUBLIC QUERIES — Banners
// ============================================

export async function getActiveNataBanners(
  spot?: string,
  client?: TypedSupabaseClient
): Promise<NataBanner[]> {
  const supabase = client || getSupabaseBrowserClient();
  const now = new Date().toISOString();

  let query = supabase
    .from('nata_banners')
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
    console.error('Error fetching nata banners:', error);
    return [];
  }
  return data || [];
}

// ============================================
// PUBLIC QUERIES — Assistance Requests
// ============================================

export async function submitNataAssistanceRequest(
  input: CreateNataAssistanceRequestInput,
  client?: TypedSupabaseClient
): Promise<NataAssistanceRequest> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('nata_assistance_requests')
    .insert({
      student_name: input.student_name,
      phone: input.phone,
      district: input.district || null,
      school_name: input.school_name || null,
      category: input.category || 'general',
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to submit assistance request: ${error.message}`);
  }
  return data as NataAssistanceRequest;
}

// ============================================
// ADMIN QUERIES — Brochures
// ============================================

export async function listNataBrochures(
  client?: TypedSupabaseClient
): Promise<NataBrochure[]> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('nata_brochures')
    .select('*')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createNataBrochure(
  input: Omit<NataBrochure, 'id' | 'created_at' | 'updated_at' | 'download_count'>,
  client?: TypedSupabaseClient
): Promise<NataBrochure> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('nata_brochures')
    .insert(input)
    .select()
    .single();

  if (error) throw new Error(`Failed to create brochure: ${error.message}`);
  return data as NataBrochure;
}

export async function updateNataBrochure(
  id: string,
  updates: Partial<Omit<NataBrochure, 'id' | 'created_at' | 'updated_at'>>,
  client?: TypedSupabaseClient
): Promise<NataBrochure> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('nata_brochures')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update brochure ${id}: ${error.message}`);
  return data as NataBrochure;
}

export async function deleteNataBrochure(
  id: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase.from('nata_brochures').delete().eq('id', id);
  if (error) throw new Error(`Failed to delete brochure ${id}: ${error.message}`);
}

// ============================================
// ADMIN QUERIES — FAQs
// ============================================

export async function listNataFaqs(
  options: { category?: string; pageSlug?: string } = {},
  client?: TypedSupabaseClient
): Promise<NataFaq[]> {
  const supabase = client || getSupabaseAdminClient();

  let query = supabase
    .from('nata_faqs')
    .select('*')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (options.category) query = query.eq('category', options.category);
  if (options.pageSlug) query = query.eq('page_slug', options.pageSlug);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createNataFaq(
  input: Omit<NataFaq, 'id' | 'created_at' | 'updated_at'>,
  client?: TypedSupabaseClient
): Promise<NataFaq> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('nata_faqs')
    .insert(input)
    .select()
    .single();

  if (error) throw new Error(`Failed to create FAQ: ${error.message}`);
  return data as NataFaq;
}

export async function updateNataFaq(
  id: string,
  updates: Partial<Omit<NataFaq, 'id' | 'created_at' | 'updated_at'>>,
  client?: TypedSupabaseClient
): Promise<NataFaq> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('nata_faqs')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update FAQ ${id}: ${error.message}`);
  return data as NataFaq;
}

export async function deleteNataFaq(
  id: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase.from('nata_faqs').delete().eq('id', id);
  if (error) throw new Error(`Failed to delete FAQ ${id}: ${error.message}`);
}

// ============================================
// ADMIN QUERIES — Announcements
// ============================================

export async function listNataAnnouncements(
  client?: TypedSupabaseClient
): Promise<NataAnnouncement[]> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('nata_announcements')
    .select('*')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createNataAnnouncement(
  input: Omit<NataAnnouncement, 'id' | 'created_at' | 'updated_at'>,
  client?: TypedSupabaseClient
): Promise<NataAnnouncement> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('nata_announcements')
    .insert(input)
    .select()
    .single();

  if (error) throw new Error(`Failed to create announcement: ${error.message}`);
  return data as NataAnnouncement;
}

export async function updateNataAnnouncement(
  id: string,
  updates: Partial<Omit<NataAnnouncement, 'id' | 'created_at' | 'updated_at'>>,
  client?: TypedSupabaseClient
): Promise<NataAnnouncement> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('nata_announcements')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update announcement ${id}: ${error.message}`);
  return data as NataAnnouncement;
}

export async function deleteNataAnnouncement(
  id: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase.from('nata_announcements').delete().eq('id', id);
  if (error) throw new Error(`Failed to delete announcement ${id}: ${error.message}`);
}

// ============================================
// ADMIN QUERIES — Banners
// ============================================

export async function listNataBanners(
  client?: TypedSupabaseClient
): Promise<NataBanner[]> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('nata_banners')
    .select('*')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createNataBanner(
  input: Omit<NataBanner, 'id' | 'created_at' | 'updated_at'>,
  client?: TypedSupabaseClient
): Promise<NataBanner> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('nata_banners')
    .insert(input)
    .select()
    .single();

  if (error) throw new Error(`Failed to create banner: ${error.message}`);
  return data as NataBanner;
}

export async function updateNataBanner(
  id: string,
  updates: Partial<Omit<NataBanner, 'id' | 'created_at' | 'updated_at'>>,
  client?: TypedSupabaseClient
): Promise<NataBanner> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('nata_banners')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update banner ${id}: ${error.message}`);
  return data as NataBanner;
}

export async function deleteNataBanner(
  id: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase.from('nata_banners').delete().eq('id', id);
  if (error) throw new Error(`Failed to delete banner ${id}: ${error.message}`);
}

// ============================================
// ADMIN QUERIES — Assistance Requests
// ============================================

export async function listNataAssistanceRequests(
  options: { status?: string; limit?: number; offset?: number } = {},
  client?: TypedSupabaseClient
): Promise<{ data: NataAssistanceRequest[]; count: number }> {
  const supabase = client || getSupabaseAdminClient();

  let query = supabase
    .from('nata_assistance_requests')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (options.status) {
    query = query.eq('status', options.status);
  }

  if (options.limit) {
    const offset = options.offset || 0;
    query = query.range(offset, offset + options.limit - 1);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data || [], count: count || 0 };
}

export async function updateNataAssistanceRequest(
  id: string,
  updates: Partial<Omit<NataAssistanceRequest, 'id' | 'created_at' | 'updated_at'>>,
  client?: TypedSupabaseClient
): Promise<NataAssistanceRequest> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('nata_assistance_requests')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update assistance request ${id}: ${error.message}`);
  return data as NataAssistanceRequest;
}
