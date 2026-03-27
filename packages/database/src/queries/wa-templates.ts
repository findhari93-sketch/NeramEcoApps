// @ts-nocheck
/**
 * WhatsApp Template Queries
 *
 * CRUD operations for WhatsApp message templates and categories.
 */

import type { TypedSupabaseClient } from '../client';
import { getSupabaseAdminClient } from '../client';
import type { WaCategory, WaTemplate } from '../types';

/**
 * Get all WhatsApp template categories ordered by sort_order
 */
export async function getWaCategories(
  client?: TypedSupabaseClient
): Promise<WaCategory[]> {
  const supabase = client ?? getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('wa_template_categories')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data ?? []) as WaCategory[];
}

/**
 * Get all non-archived WhatsApp templates with their categories
 */
export async function getAllWaTemplates(
  client?: TypedSupabaseClient
): Promise<WaTemplate[]> {
  const supabase = client ?? getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('wa_templates')
    .select('*, wa_template_categories(*)')
    .eq('is_archived', false)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ...row,
    category: row.wa_template_categories,
    wa_template_categories: undefined,
  })) as WaTemplate[];
}

/**
 * Get WhatsApp templates by category ID
 */
export async function getWaTemplatesByCategory(
  categoryId: string,
  client?: TypedSupabaseClient
): Promise<WaTemplate[]> {
  const supabase = client ?? getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('wa_templates')
    .select('*, wa_template_categories(*)')
    .eq('category_id', categoryId)
    .eq('is_archived', false)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ...row,
    category: row.wa_template_categories,
    wa_template_categories: undefined,
  })) as WaTemplate[];
}

/**
 * Get a single WhatsApp template by ID
 */
export async function getWaTemplateById(
  id: string,
  client?: TypedSupabaseClient
): Promise<WaTemplate | null> {
  const supabase = client ?? getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('wa_templates')
    .select('*, wa_template_categories(*)')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  const row = data as any;
  return {
    ...row,
    category: row.wa_template_categories,
    wa_template_categories: undefined,
  } as WaTemplate;
}

/**
 * Create a new WhatsApp template
 */
export async function createWaTemplate(
  data: {
    category_id: string;
    title: string;
    body: string;
    placeholders: string[];
    sort_order?: number;
    created_by?: string;
    updated_by?: string;
  },
  client?: TypedSupabaseClient
): Promise<WaTemplate> {
  const supabase = client ?? getSupabaseAdminClient();

  const { data: result, error } = await (supabase
    .from('wa_templates') as any)
    .insert({
      category_id: data.category_id,
      title: data.title,
      body: data.body,
      placeholders: data.placeholders,
      sort_order: data.sort_order ?? 0,
      created_by: data.created_by || null,
      updated_by: data.updated_by || null,
    })
    .select()
    .single();

  if (error) throw error;
  return result as WaTemplate;
}

/**
 * Update a WhatsApp template
 */
export async function updateWaTemplate(
  id: string,
  updates: Partial<{
    category_id: string;
    title: string;
    body: string;
    placeholders: string[];
    sort_order: number;
    is_archived: boolean;
    updated_by: string;
  }>,
  client?: TypedSupabaseClient
): Promise<WaTemplate> {
  const supabase = client ?? getSupabaseAdminClient();

  const { data, error } = await (supabase
    .from('wa_templates') as any)
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as WaTemplate;
}

/**
 * Archive a WhatsApp template (soft delete)
 */
export async function archiveWaTemplate(
  id: string,
  updatedBy?: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client ?? getSupabaseAdminClient();

  const { error } = await (supabase
    .from('wa_templates') as any)
    .update({
      is_archived: true,
      updated_by: updatedBy || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw error;
}

/**
 * Create a new WhatsApp template category
 */
export async function createWaCategory(
  data: {
    name: string;
    slug: string;
    sort_order?: number;
  },
  client?: TypedSupabaseClient
): Promise<WaCategory> {
  const supabase = client ?? getSupabaseAdminClient();

  const { data: result, error } = await (supabase
    .from('wa_template_categories') as any)
    .insert({
      name: data.name,
      slug: data.slug,
      sort_order: data.sort_order ?? 0,
    })
    .select()
    .single();

  if (error) throw error;
  return result as WaCategory;
}
