// @ts-nocheck — nexus_qb_tags / nexus_qb_question_tags and the nexus_qb_find_similar /
// nexus_qb_tag_counts RPCs are not yet in the generated Supabase types.
// Regenerate with pnpm supabase:gen:types after 20260713180000 is applied.
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type { NexusQBTag, NexusQBTagGroup, NexusQBTagWithCount, NexusQBTagNode } from '../../types';

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

// ============================================
// SUBJECT HIERARCHY (nexus_qb_tags.parent_id)
// ============================================

export interface QBTagCount {
  self: number;
  rollup: number;
}

/**
 * Nest a flat tag list into a parent -> child forest.
 *
 * Pure and exported so it can be unit tested without a database. Mirrors the
 * behaviour of getQBTopicTree: a row whose parent_id points at a tag that is
 * missing or inactive surfaces as a root rather than disappearing. A cycle
 * (A -> B -> A, only reachable via a hand-edited parent_id) is broken by
 * treating the second visit as a root, so this can never loop.
 *
 * Sibling order follows the input order, which listQBTags already sorts by
 * sort_order then label.
 */
export function buildQBTagTree(
  rows: NexusQBTag[],
  counts?: Map<string, QBTagCount>,
): NexusQBTagNode[] {
  const nodes = new Map<string, NexusQBTagNode>();
  for (const row of rows) {
    const c = counts?.get(row.slug);
    nodes.set(row.id, {
      ...row,
      self_count: c?.self ?? 0,
      rollup_count: c?.rollup ?? c?.self ?? 0,
      children: [],
    });
  }

  const roots: NexusQBTagNode[] = [];
  for (const row of rows) {
    const node = nodes.get(row.id)!;
    const parent = row.parent_id ? nodes.get(row.parent_id) : undefined;
    if (!parent || parent.id === node.id || isDescendantOf(parent, node.id, nodes)) {
      roots.push(node);
    } else {
      parent.children.push(node);
    }
  }
  return roots;
}

/** Walk up from `node` to detect whether `candidateId` is already below it. */
function isDescendantOf(
  node: NexusQBTagNode,
  candidateId: string,
  nodes: Map<string, NexusQBTagNode>,
): boolean {
  let cursor: NexusQBTagNode | undefined = node;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor.id === candidateId) return true;
    if (seen.has(cursor.id)) return true; // pre-existing cycle, bail out
    seen.add(cursor.id);
    cursor = cursor.parent_id ? nodes.get(cursor.parent_id) : undefined;
  }
  return false;
}

/**
 * The subject tag forest with facet counts, for the two-level Category filter.
 *
 * Counts come from nexus_qb_category_counts(), which computes rollup_count as
 * COUNT(DISTINCT question) over each tag's transitive closure. Never sum
 * children in JS: a question tagged both `locus` and `parabola` would then be
 * counted twice under Coordinate Geometry.
 */
export async function getQBSubjectTagTree(
  scope?: { exam_type?: string | null; year?: number | null; session?: string | null; shift?: string | null },
  client?: TypedSupabaseClient,
): Promise<{ tree: NexusQBTagNode[]; counts: Record<string, number> }> {
  const supabase = client || getSupabaseAdminClient();
  const [tags, countsRes] = await Promise.all([
    listQBTags({ group: 'subject' }, supabase),
    supabase.rpc('nexus_qb_category_counts', {
      p_exam_type: scope?.exam_type ?? null,
      p_year: scope?.year ?? null,
      p_session: scope?.session ?? null,
      p_shift: scope?.shift ?? null,
    }),
  ]);
  if (countsRes.error) throw countsRes.error;

  const countMap = new Map<string, QBTagCount>();
  const flat: Record<string, number> = {};
  for (const row of (countsRes.data || []) as Array<{
    slug: string;
    self_count: number | string;
    rollup_count: number | string;
  }>) {
    const self = Number(row.self_count) || 0;
    const rollup = Number(row.rollup_count) || 0;
    countMap.set(row.slug, { self, rollup });
    if (self > 0) flat[row.slug] = self;
  }

  return { tree: buildQBTagTree(tags, countMap), counts: flat };
}

// Parent slug -> all descendant slugs, cached because the registry is ~55 rows
// and changes roughly monthly, while this is consulted on every filtered query.
const SLUG_TREE_TTL_MS = 5 * 60 * 1000;
let slugTreeCache: { at: number; map: Map<string, string[]> } | null = null;

/** Test seam: drop the memoized descendant map. */
export function clearQBCategorySlugCache(): void {
  slugTreeCache = null;
}

/**
 * Expand any parent slugs in a category selection into themselves plus all of
 * their descendants.
 *
 * The client already does this before calling the API, so this is a safety net
 * for hand-typed or bookmarked URLs (?cat=coordinate_geometry) and for any
 * caller that stores a collapsed selection, such as a saved preset. It is
 * idempotent, and unknown slugs pass through untouched so off-vocabulary
 * categories keep working.
 */
export async function expandQBCategorySlugs(
  slugs: string[],
  client?: TypedSupabaseClient,
): Promise<string[]> {
  if (!slugs || slugs.length === 0) return [];

  let map = slugTreeCache && Date.now() - slugTreeCache.at < SLUG_TREE_TTL_MS ? slugTreeCache.map : null;
  if (!map) {
    try {
      const rows = await listQBTags({ group: 'subject' }, client);
      map = buildQBDescendantMap(rows);
      slugTreeCache = { at: Date.now(), map };
    } catch {
      // Registry unreachable: fall back to the caller's slugs verbatim rather
      // than dropping their filter entirely.
      return [...new Set(slugs)];
    }
  }

  const out = new Set<string>();
  for (const slug of slugs) {
    out.add(slug);
    for (const child of map.get(slug) || []) out.add(child);
  }
  return [...out];
}

/** Flat slug -> all descendant slugs (exclusive of the key itself). Pure. */
export function buildQBDescendantMap(rows: NexusQBTag[]): Map<string, string[]> {
  const bySlug = new Map<string, NexusQBTagNode>();
  const tree = buildQBTagTree(rows);
  const map = new Map<string, string[]>();

  const walk = (node: NexusQBTagNode): string[] => {
    const acc: string[] = [];
    for (const child of node.children) {
      acc.push(child.slug, ...walk(child));
    }
    map.set(node.slug, acc);
    bySlug.set(node.slug, node);
    return acc;
  };
  for (const root of tree) walk(root);
  return map;
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

/**
 * Get the tag with this slug, creating it only if it does not exist yet.
 *
 * `createQBTag` is a plain insert against a UNIQUE(slug) index, so anything that
 * derives a slug from a human or AI label eventually collides and throws 23505.
 * In the wrap-up panel that surfaced as "That tag already exists" followed by the
 * suggestion chip vanishing with nothing attached: the tag the teacher asked for
 * existed the whole time.
 *
 * Two details that matter:
 *   - The lookup ignores `is_active`, because the unique index does too. A
 *     deactivated tag otherwise makes its own slug permanently uncreatable.
 *   - An inactive match is reactivated rather than duplicated. Someone asking
 *     for it again is the clearest signal it should be back.
 *
 * Same shape as addQuestionTags' idempotent upsert; both exist so that
 * re-running a write is never an error.
 */
export async function findOrCreateQBTag(
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
): Promise<{ tag: NexusQBTag; created: boolean }> {
  const supabase = client || getSupabaseAdminClient();
  const slug = qbSlugify(input.slug || input.label);
  if (!slug) throw new Error('Tag label/slug cannot be empty');

  const findBySlug = async (): Promise<NexusQBTag | null> => {
    const { data } = await supabase.from(TAGS).select('*').eq('slug', slug).maybeSingle();
    return (data as NexusQBTag) || null;
  };

  const existing = await findBySlug();
  if (existing) {
    if (existing.is_active === false) {
      const { data } = await supabase
        .from(TAGS)
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select('*')
        .single();
      return { tag: (data as NexusQBTag) || existing, created: false };
    }
    return { tag: existing, created: false };
  }

  try {
    return { tag: await createQBTag({ ...input, slug }, client), created: true };
  } catch (err) {
    // Lost a race with a concurrent create: the winner's row is the answer.
    const raced = await findBySlug();
    if (raced) return { tag: raced, created: false };
    throw err;
  }
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

/**
 * ADD tags to many questions without touching their existing tags (bulk tagging).
 * Idempotent upsert on the (question_id, tag_id) primary key. Never use the
 * delete-reinsert setQuestionTags for bulk-add, it would wipe existing tags.
 */
export async function addQuestionTags(
  questionIds: string[],
  tagIds: string[],
  createdBy?: string | null,
  client?: TypedSupabaseClient,
): Promise<{ inserted: number }> {
  const supabase = client || getSupabaseAdminClient();
  const qids = [...new Set(questionIds)].filter(Boolean);
  const tids = [...new Set(tagIds)].filter(Boolean);
  if (qids.length === 0 || tids.length === 0) return { inserted: 0 };
  const rows: Array<{ question_id: string; tag_id: string; created_by: string | null }> = [];
  for (const question_id of qids) {
    for (const tag_id of tids) {
      rows.push({ question_id, tag_id, created_by: createdBy ?? null });
    }
  }
  // Chunk to keep each request modest (cross-product can get large).
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase
      .from(QUESTION_TAGS)
      .upsert(rows.slice(i, i + 500), { onConflict: 'question_id,tag_id', ignoreDuplicates: true });
    if (error) throw error;
  }
  return { inserted: rows.length };
}

/**
 * Per-question additive tagging (pairs mode): each question gets its own tag set
 * added on top of whatever it already has. Used by the tagging assistant commit.
 */
export async function addQuestionTagPairs(
  pairs: Array<{ question_id: string; tag_ids: string[] }>,
  createdBy?: string | null,
  client?: TypedSupabaseClient,
): Promise<{ inserted: number }> {
  const supabase = client || getSupabaseAdminClient();
  const rows: Array<{ question_id: string; tag_id: string; created_by: string | null }> = [];
  for (const p of pairs) {
    if (!p?.question_id) continue;
    for (const tag_id of [...new Set(p.tag_ids || [])]) {
      if (tag_id) rows.push({ question_id: p.question_id, tag_id, created_by: createdBy ?? null });
    }
  }
  if (rows.length === 0) return { inserted: 0 };
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase
      .from(QUESTION_TAGS)
      .upsert(rows.slice(i, i + 500), { onConflict: 'question_id,tag_id', ignoreDuplicates: true });
    if (error) throw error;
  }
  return { inserted: rows.length };
}

/**
 * Page through ACTIVE questions that carry no registry tags at all (the tagging
 * assistant's default scope). Diffed in JS: an id-only scan of both tables stays
 * small (a few thousand rows) and avoids a giant not-in URL against PostgREST.
 */
export async function getUntaggedQuestionsPage(
  page: number,
  pageSize: number,
  client?: TypedSupabaseClient,
): Promise<{ questions: Array<{ id: string; question_text: string | null; options: unknown }>; total: number }> {
  const supabase = client || getSupabaseAdminClient();
  const [allRes, taggedRes] = await Promise.all([
    supabase
      .from('nexus_qb_questions')
      .select('id')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .range(0, 99999),
    supabase.from(QUESTION_TAGS).select('question_id').range(0, 99999),
  ]);
  if (allRes.error) throw allRes.error;
  if (taggedRes.error) throw taggedRes.error;
  const tagged = new Set((taggedRes.data || []).map((r: any) => r.question_id));
  const untaggedIds = (allRes.data || []).map((r: any) => r.id).filter((id: string) => !tagged.has(id));
  const total = untaggedIds.length;
  const pageIds = untaggedIds.slice((page - 1) * pageSize, page * pageSize);
  if (pageIds.length === 0) return { questions: [], total };
  const { data, error } = await supabase
    .from('nexus_qb_questions')
    .select('id, question_text, options')
    .in('id', pageIds);
  if (error) throw error;
  const byId = new Map<string, any>((data || []).map((q: any) => [q.id, q]));
  return { questions: pageIds.map((id: string) => byId.get(id)).filter(Boolean), total };
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
