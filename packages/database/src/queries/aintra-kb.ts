// @ts-nocheck
/**
 * Aintra Knowledge Base Queries
 * Dynamic Q&A pairs for Aintra AI assistant system prompt injection
 */

import { getSupabaseAdminClient } from '../client';
import type { AintraKnowledgeBaseItem } from '../types';

// ============================================
// PUBLIC QUERY — used by marketing chat API
// ============================================

/**
 * Fetch all active KB items ordered by display_order.
 * Used by /api/chat and /api/nata/chat to inject into Gemini system prompt.
 */
export async function getActiveAintraKnowledgeBase(): Promise<AintraKnowledgeBaseItem[]> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('aintra_knowledge_base')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[AintraKB] Failed to fetch active knowledge base:', error);
    return [];
  }

  return data || [];
}

// ============================================
// ADMIN QUERIES — CRUD
// ============================================

export async function listAintraKnowledgeBase(
  options: { category?: string } = {}
): Promise<AintraKnowledgeBaseItem[]> {
  const supabase = getSupabaseAdminClient();

  let query = supabase
    .from('aintra_knowledge_base')
    .select('*')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (options.category) {
    query = query.eq('category', options.category);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list Aintra KB: ${error.message}`);
  return data || [];
}

export async function createAintraKnowledgeBaseItem(
  input: Omit<AintraKnowledgeBaseItem, 'id' | 'created_at' | 'updated_at'>
): Promise<AintraKnowledgeBaseItem> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('aintra_knowledge_base')
    .insert(input)
    .select()
    .single();

  if (error) throw new Error(`Failed to create KB item: ${error.message}`);
  return data as AintraKnowledgeBaseItem;
}

export async function updateAintraKnowledgeBaseItem(
  id: string,
  updates: Partial<Omit<AintraKnowledgeBaseItem, 'id' | 'created_at' | 'updated_at'>>
): Promise<AintraKnowledgeBaseItem> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('aintra_knowledge_base')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update KB item ${id}: ${error.message}`);
  return data as AintraKnowledgeBaseItem;
}

export async function deleteAintraKnowledgeBaseItem(id: string): Promise<void> {
  const supabase = getSupabaseAdminClient();

  const { error } = await supabase
    .from('aintra_knowledge_base')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Failed to delete KB item ${id}: ${error.message}`);
}
