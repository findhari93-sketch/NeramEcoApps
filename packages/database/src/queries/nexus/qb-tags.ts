// @ts-nocheck — nexus_qb_tags / nexus_qb_question_tags and the nexus_qb_find_similar /
// nexus_qb_tag_counts RPCs are not yet in the generated Supabase types.
// Regenerate with pnpm supabase:gen:types after 20260713180000 is applied.
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type { NexusQBTag, NexusQBTagGroup, NexusQBTagWithCount } from '../../types';

const TAGS = 'nexus_qb_tags';
const QUESTION_TAGS = 'nexus_qb_question_tags';

/** Slugify a label into a stable tag slug. */
export function qbSlugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// ============================================
// READ
// ============================================

/** All tags (active by default), ordered by group then sort_order then label. */
export async function listQBTags(
  opts?: { includeInactive?: boolean; group?: NexusQBTagGroup },
  client?: TypedSupabaseClient,
): Promise<NexusQBTag[]> {
  const supabase = client || getSupabaseAdminClient();
  let query = supabase
    .from(TAGS)
    .select('*')
    .order('group_type', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true });
  if (!opts?.includeInactive) query = query.eq('is_active', true);
  if (opts?.group) query = query.eq('group_type', opts.group);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as NexusQBTag[];
}

/** Tags enriched with their active-question counts (single DB-side aggregation via RPC). */
export async function getQBTagsWithCounts(
  opts?: { includeInactive?: boolean; group?: NexusQBTagGroup },
  client?: TypedSupabaseClient,
): Promise<NexusQBTagWithCount[]> {
  const supabase = client || getSupabaseAdminClient();
  const [tags, countsRes] = await Promise.all([
    listQBTags(opts, supabase),
    supabase.rpc('nexus_qb_tag_counts'),
  ]);
  if (countsRes.error) throw countsRes.error;
  const countMap = new Map<string, number>();
  for (const row of (countsRes.data || []) as Array<{ tag_id: string; question_count: number }>) {
    countMap.set(row.tag_id, Number(row.question_count) || 0);
  }
  return tags.map((t) => ({ ...t, question_count: countMap.get(t.id) || 0 }));
}

/** The tag ids applied to a question. */
export async function getQuestionTagIds(
  questionId: string,
  client?: TypedSupabaseClient,
): Promise<string[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase.from(QUESTION_TAGS).select('tag_id').eq('question_id', questionId);
  if (error) throw error;
  return (data || []).map((r: any) => r.tag_id as string);
}

// ============================================
// WRITE (registry management)
// ============================================

export async function createQBTag(
  input: {
    group_type: NexusQBTagGroup;
    label: string;
    slug?: string;
    parent_id?: string | null;
    color?: string | null;
    icon?: string | null;
    sort_order?: number;
    created_by?: string | null;
  },
  client?: TypedSupabaseClient,
): Promise<NexusQBTag> {
  const supabase = client || getSupabaseAdminClient();
  const slug = qbSlugify(input.slug || input.label);
  if (!slug) throw new Error('Tag label/slug cannot be empty');
  const { data, error } = await supabase
    .from(TAGS)
    .insert({
      group_type: input.group_type,
      slug,
      label: input.label.trim(),
      parent_id: input.parent_id ?? null,
      color: input.color ?? null,
      icon: input.icon ?? null,
      sort_order: input.sort_order ?? 0,
      is_system: false, // teacher/admin-created tags are always editable
      created_by: input.created_by ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as NexusQBTag;
}

/** Rename / recolor / reorder / (de)activate a tag. System tags cannot be deactivated. */
export async function updateQBTag(
  id: string,
  patch: Partial<{
    label: string;
    parent_id: string | null;
    color: string | null;
    icon: string | null;
    sort_order: number;
    is_active: boolean;
  }>,
  client?: TypedSupabaseClient,
): Promise<NexusQBTag> {
  const supabase = client || getSupabaseAdminClient();

  if (patch.is_active === false) {
    const { data: existing } = await supabase.from(TAGS).select('is_system').eq('id', id).single();
    if (existing?.is_system) {
      throw new Error('Core (system) tags cannot be deactivated');
    }
  }

  const { data, error } = await supabase
    .from(TAGS)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as NexusQBTag;
}

/**
 * Write-through for newly authored questions: derive tags from the chosen
 * categories[] + exam relevance and apply them, so new questions are tag-consistent
 * without extra UI. (Transition strategy: authoring writes both categories[] and tags.)
 */
export async function syncTagsForNewQuestion(
  questionId: string,
  opts: { categories?: string[] | null; examRelevance?: string | null; createdBy?: string | null },
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const slugs = new Set<string>();
  for (const c of opts.categories || []) if (c) slugs.add(c);
  if (opts.examRelevance === 'JEE' || opts.examRelevance === 'BOTH') slugs.add('jee');
  if (opts.examRelevance === 'NATA' || opts.examRelevance === 'BOTH') slugs.add('nata');
  if (slugs.size === 0) return;
  const { data } = await supabase.from(TAGS).select('id').in('slug', [...slugs]);
  const tagIds = (data || []).map((r: any) => r.id as string);
  if (tagIds.length > 0) await setQuestionTags(questionId, tagIds, opts.createdBy ?? null, supabase);
}

/** Replace a question's tags with the given set (delete + reinsert). */
export async function setQuestionTags(
  questionId: string,
  tagIds: string[],
  createdBy?: string | null,
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  await supabase.from(QUESTION_TAGS).delete().eq('question_id', questionId);
  const unique = [...new Set(tagIds)];
  if (unique.length > 0) {
    const rows = unique.map((tag_id) => ({ question_id: questionId, tag_id, created_by: createdBy ?? null }));
    const { error } = await supabase.from(QUESTION_TAGS).insert(rows);
    if (error) throw error;
  }
}

// ============================================
// DEDUPE
// ============================================

export interface QBDuplicateCandidate {
  id: string;
  question_text: string | null;
  options: unknown;
  similarity: number;
  used_in_tests: number;
}

/**
 * Find near-duplicate questions by normalized trigram similarity, scoped by exam + tags.
 * Backed by the nexus_qb_find_similar RPC (GIN-indexed, sub-100ms when scoped).
 */
export async function findSimilarQuestions(
  input: {
    text: string;
    examRelevance?: 'JEE' | 'NATA' | 'BOTH' | null;
    tagIds?: string[] | null;
    threshold?: number;
    limit?: number;
  },
  client?: TypedSupabaseClient,
): Promise<QBDuplicateCandidate[]> {
  const text = (input.text || '').trim();
  if (!text) return [];
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase.rpc('nexus_qb_find_similar', {
    p_text: text,
    p_exam_relevance: input.examRelevance ?? null,
    p_tag_ids: input.tagIds && input.tagIds.length > 0 ? input.tagIds : null,
    p_threshold: input.threshold ?? 0.35,
    p_limit: input.limit ?? 5,
  });
  if (error) throw error;
  return (data || []).map((r: any) => ({
    id: r.id,
    question_text: r.question_text,
    options: r.options,
    similarity: Number(r.similarity) || 0,
    used_in_tests: Number(r.used_in_tests) || 0,
  }));
}
