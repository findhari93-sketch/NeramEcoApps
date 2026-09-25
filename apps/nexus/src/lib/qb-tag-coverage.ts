/**
 * Server side of the Question Bank "Tag coverage" screen.
 *
 * Kept in Nexus rather than packages/database on purpose: only Nexus reads it,
 * so a change here redeploys one app, not four.
 *
 * Three questions it answers, all without a model call:
 *   1. How much of the bank carries a subject or theme tag at all.
 *   2. For each architecture topic, how many untagged-for-that-topic questions
 *      the keyword dictionary thinks belong to it.
 *   3. For one topic, which questions those are, and why.
 *
 * "Tagged" means at least one registry tag of group `subject` or `theme`. An
 * exam tag (nata, jee) alone does not make a question findable by topic, which
 * is the whole problem this screen exists to fix.
 *
 * WHICH QUESTIONS COUNT
 *
 * Every row in nexus_qb_questions. There is no soft delete on the bank: a
 * deleted question is a hard delete (hardDeleteQBQuestions), so nothing needs
 * excluding for that. Inactive rows are kept in on purpose: they are mostly
 * past-paper questions waiting for an answer key, and a tag written now is one
 * that is already there when the key lands and the question goes live.
 */

import { fetchAllRows } from '@neram/database';
import { ApiError } from '@/lib/api-errors';
import { ARCHITECTURE_SUBJECT_SLUGS, keywordsForTag, mergeTagKeywords } from '@/lib/qb-tag-keywords';
import {
  buildTagMatchers,
  chunkOrFilters,
  confidenceFor,
  ilikePatternFor,
  matchTerms,
  questionMatchText,
  type SuggestConfidence,
  type TagMatcher,
} from '@/lib/qb-tag-suggest';

type Db = any;

export const DISMISSALS_TABLE = 'nexus_qb_tag_suggestion_dismissals';
const QUESTIONS = 'nexus_qb_questions';
const QUESTION_TAGS = 'nexus_qb_question_tags';
const TAGS = 'nexus_qb_tags';

/** The most ids one `.in()` filter carries. See IN_LIST_CHUNK in packages/database/src/utils/paged-rows.ts. */
const IN_CHUNK = 200;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

export interface RegistryTagRow {
  id: string;
  slug: string;
  label: string;
  group_type: 'exam' | 'subject' | 'theme';
  aliases: string[] | null;
  parent_id: string | null;
  is_active: boolean;
  sort_order: number | null;
}

export interface CoverageRegistry {
  all: RegistryTagRow[];
  byId: Map<string, RegistryTagRow>;
  bySlug: Map<string, RegistryTagRow>;
  /** Theme tags plus the architecture subject tags, active only. */
  topics: RegistryTagRow[];
  /** ids of every subject or theme tag, active or not: any of them makes a question "tagged". */
  subjectThemeIds: Set<string>;
  /** One matcher per topic that has any phrases. */
  matchers: TagMatcher[];
  matcherBySlug: Map<string, TagMatcher>;
}

const ARCH_SUBJECTS = new Set<string>(ARCHITECTURE_SUBJECT_SLUGS);

export function isCoverageTopic(tag: Pick<RegistryTagRow, 'slug' | 'group_type' | 'is_active'>): boolean {
  if (!tag.is_active) return false;
  return tag.group_type === 'theme' || (tag.group_type === 'subject' && ARCH_SUBJECTS.has(tag.slug));
}

export async function loadCoverageRegistry(supabase: Db): Promise<CoverageRegistry> {
  const { data, error } = await supabase
    .from(TAGS)
    .select('id, slug, label, group_type, aliases, parent_id, is_active, sort_order');
  if (error) throw error;
  const all = (data || []) as RegistryTagRow[];
  const topics = all.filter(isCoverageTopic);
  const matchers = buildTagMatchers(mergeTagKeywords(topics));
  return {
    all,
    byId: new Map(all.map((t) => [t.id, t])),
    bySlug: new Map(all.map((t) => [t.slug, t])),
    topics,
    subjectThemeIds: new Set(all.filter((t) => t.group_type === 'subject' || t.group_type === 'theme').map((t) => t.id)),
    matchers,
    matcherBySlug: new Map(matchers.map((m) => [m.slug, m])),
  };
}

/**
 * True when the error says the dismissals table is not there yet.
 *
 * The migration ships with this screen but is applied on deploy, so a local
 * server pointed at a database without it must still show suggestions. Reads
 * treat a missing table as "nothing dismissed"; the dismiss write reports it.
 */
export function isMissingTableError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === '42P01' || e.code === 'PGRST205') return true;
  return typeof e.message === 'string' && /relation .* does not exist|Could not find the table/i.test(e.message);
}

async function readDismissals(
  build: () => { range(from: number, to: number): PromiseLike<{ data: unknown[] | null; error: unknown }> },
): Promise<Array<{ question_id: string; tag_id: string }>> {
  try {
    return (await fetchAllRows(build as never)) as Array<{ question_id: string; tag_id: string }>;
  } catch (err) {
    if (isMissingTableError(err)) return [];
    throw err;
  }
}

const pairKey = (questionId: string, tagId: string) => `${questionId}:${tagId}`;

// ============================================================================
// Coverage summary
// ============================================================================

export interface CoverageTopic {
  tag_id: string;
  slug: string;
  label: string;
  group_type: 'subject' | 'theme';
  tagged_count: number;
  suggestion_count: number;
  high_confidence_count: number;
}

export interface CoverageSummary {
  total: number;
  tagged: number;
  untagged: number;
  topics: CoverageTopic[];
}

/**
 * The whole bank in four reads (questions, question tags, dismissals, tags),
 * each paged to exhaustion, then scored in memory. No per-topic queries.
 */
export async function computeCoverage(supabase: Db): Promise<CoverageSummary> {
  const [registry, questions, questionTags, dismissals] = await Promise.all([
    loadCoverageRegistry(supabase),
    fetchAllRows<{ id: string; question_text: string | null; options: unknown }>(() =>
      supabase.from(QUESTIONS).select('id, question_text, options').order('id', { ascending: true }),
    ),
    fetchAllRows<{ question_id: string; tag_id: string }>(() =>
      supabase
        .from(QUESTION_TAGS)
        .select('question_id, tag_id')
        .order('question_id', { ascending: true })
        .order('tag_id', { ascending: true }),
    ),
    readDismissals(() =>
      supabase
        .from(DISMISSALS_TABLE)
        .select('question_id, tag_id')
        .order('question_id', { ascending: true })
        .order('tag_id', { ascending: true }),
    ),
  ]);

  const questionIds = new Set(questions.map((q) => q.id));
  const tagsByQuestion = new Map<string, Set<string>>();
  const taggedCount = new Map<string, number>();
  for (const row of questionTags) {
    if (!questionIds.has(row.question_id)) continue;
    let set = tagsByQuestion.get(row.question_id);
    if (!set) tagsByQuestion.set(row.question_id, (set = new Set()));
    set.add(row.tag_id);
    taggedCount.set(row.tag_id, (taggedCount.get(row.tag_id) || 0) + 1);
  }
  const dismissed = new Set(dismissals.map((d) => pairKey(d.question_id, d.tag_id)));

  let tagged = 0;
  const suggestions = new Map<string, { all: number; high: number }>();
  const topicBySlug = new Map(registry.topics.map((t) => [t.slug, t]));

  for (const q of questions) {
    const own = tagsByQuestion.get(q.id);
    if (own && [...own].some((id) => registry.subjectThemeIds.has(id))) tagged += 1;

    const text = questionMatchText(q.question_text, q.options);
    if (!text) continue;
    for (const matcher of registry.matchers) {
      const topic = topicBySlug.get(matcher.slug);
      if (!topic) continue;
      if (own?.has(topic.id) || dismissed.has(pairKey(q.id, topic.id))) continue;
      const terms = matchTerms(text, matcher);
      if (terms.length === 0) continue;
      const tally = suggestions.get(topic.id) || { all: 0, high: 0 };
      tally.all += 1;
      if (confidenceFor(terms.length) === 'high') tally.high += 1;
      suggestions.set(topic.id, tally);
    }
  }

  const topics: CoverageTopic[] = registry.topics.map((t) => ({
    tag_id: t.id,
    slug: t.slug,
    label: t.label,
    group_type: t.group_type as 'subject' | 'theme',
    tagged_count: taggedCount.get(t.id) || 0,
    suggestion_count: suggestions.get(t.id)?.all || 0,
    high_confidence_count: suggestions.get(t.id)?.high || 0,
  }));
  topics.sort(
    (a, b) =>
      b.suggestion_count - a.suggestion_count ||
      // Themes first on a tie: they are what a teacher names a test after.
      (a.group_type === b.group_type ? 0 : a.group_type === 'theme' ? -1 : 1) ||
      a.label.localeCompare(b.label),
  );

  return { total: questions.length, tagged, untagged: questions.length - tagged, topics };
}

// ============================================================================
// Suggestions for one topic
// ============================================================================

export interface SuggestionCandidate {
  id: string;
  question_text: string | null;
  options: unknown;
  correct_answer: string | null;
  exam_relevance: string | null;
  origin: string | null;
  matched_terms: string[];
  confidence: SuggestConfidence;
}

/** Resolve `?tag=<slug>` or `?tag_id=<uuid>` to an active topic, or throw a 400/404. */
export function resolveTopic(
  registry: CoverageRegistry,
  opts: { slug?: string | null; tagId?: string | null },
): RegistryTagRow {
  const slug = (opts.slug || '').trim();
  const tagId = (opts.tagId || '').trim();
  if (!slug && !tagId) throw new ApiError('Pass tag=<slug> or tag_id=<uuid>', 400);
  if (tagId && !isUuid(tagId)) throw new ApiError('tag_id must be a uuid', 400);
  const tag = tagId ? registry.byId.get(tagId) : registry.bySlug.get(slug);
  if (!tag || !tag.is_active) throw new ApiError('That tag does not exist or is switched off', 404);
  if (tag.group_type === 'exam') throw new ApiError('Exam tags are not suggested from question text', 400);
  return tag;
}

/**
 * Every question the dictionary suggests for `tag`, minus those that already
 * carry it and those a teacher dismissed for it.
 *
 * The candidates are narrowed in SQL first, with an ILIKE per phrase against
 * search_doc_norm (the question and its options, normalised, trigram indexed),
 * then scored in TypeScript with the whole-word matcher, which drops the false
 * positives ILIKE lets through ("dome" in "domestic").
 *
 * Sorted high confidence first, then by how many phrases matched, then by id,
 * so the order is stable between requests. The review queue relies on that to
 * page past the questions a teacher skipped.
 */
export async function findTagSuggestions(
  supabase: Db,
  registry: CoverageRegistry,
  tag: RegistryTagRow,
): Promise<SuggestionCandidate[]> {
  const phrases = keywordsForTag(tag);
  const matcher = registry.matcherBySlug.get(tag.slug) ?? buildTagMatchers({ [tag.slug]: phrases })[0];
  if (!matcher || phrases.length === 0) return [];

  const groups = chunkOrFilters('search_doc_norm', phrases.map(ilikePatternFor));
  const [pages, taggedRows, dismissedRows] = await Promise.all([
    Promise.all(
      groups.map((filter) =>
        fetchAllRows<{
          id: string;
          question_text: string | null;
          options: unknown;
          correct_answer: string | null;
          exam_relevance: string | null;
          origin: string | null;
        }>(() =>
          supabase
            .from(QUESTIONS)
            .select('id, question_text, options, correct_answer, exam_relevance, origin')
            .or(filter)
            .order('id', { ascending: true }),
        ),
      ),
    ),
    fetchAllRows<{ question_id: string }>(() =>
      supabase.from(QUESTION_TAGS).select('question_id').eq('tag_id', tag.id).order('question_id', { ascending: true }),
    ),
    readDismissals(() =>
      supabase.from(DISMISSALS_TABLE).select('question_id, tag_id').eq('tag_id', tag.id).order('question_id', { ascending: true }),
    ),
  ]);

  const skip = new Set<string>([
    ...taggedRows.map((r) => r.question_id),
    ...dismissedRows.map((r) => r.question_id),
  ]);

  const seen = new Set<string>();
  const out: SuggestionCandidate[] = [];
  for (const page of pages) {
    for (const q of page) {
      if (seen.has(q.id) || skip.has(q.id)) continue;
      seen.add(q.id);
      const terms = matchTerms(questionMatchText(q.question_text, q.options), matcher);
      if (terms.length === 0) continue;
      out.push({
        id: q.id,
        question_text: q.question_text,
        options: q.options,
        correct_answer: q.correct_answer,
        exam_relevance: q.exam_relevance,
        origin: q.origin,
        matched_terms: terms,
        confidence: confidenceFor(terms.length),
      });
    }
  }

  out.sort(
    (a, b) =>
      (a.confidence === b.confidence ? 0 : a.confidence === 'high' ? -1 : 1) ||
      b.matched_terms.length - a.matched_terms.length ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  return out;
}

export interface SuggestedTagRef {
  tag_id: string;
  slug: string;
  label: string;
}

export interface SuggestionItem extends SuggestionCandidate {
  also_suggested: SuggestedTagRef[];
  source_label: string;
  /** Whether the question already carries some subject or theme tag (so accepting does not move the coverage meter). */
  has_topic_tag: boolean;
}

/** Where a question came from, in the words a teacher uses. */
export function sourceLabelFor(origin: string | null | undefined, fromClass: boolean): string {
  switch (origin) {
    case 'pyq':
      return 'Past paper';
    case 'imported':
      return 'Study material';
    case 'student_recalled':
      return 'Student recall';
    case 'authored':
      return fromClass ? 'Class checkpoint' : 'Written by a teacher';
    default:
      return 'Question bank';
  }
}

const CLASS_TEST_SOURCES = new Set(['recap_authored', 'catchup_class']);

async function chunkedSelect<T>(ids: string[], run: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await run(ids.slice(i, i + IN_CHUNK));
    if (error) throw error;
    out.push(...(data || []));
  }
  return out;
}

/**
 * Fill in, for one page of candidates, the other topics each question also
 * looks like (minus ones it already has or had dismissed) and a source label.
 */
export async function decorateSuggestions(
  supabase: Db,
  registry: CoverageRegistry,
  tag: RegistryTagRow,
  page: SuggestionCandidate[],
): Promise<SuggestionItem[]> {
  if (page.length === 0) return [];
  const ids = page.map((p) => p.id);

  const [ownTags, dismissedRows, classRows] = await Promise.all([
    chunkedSelect<{ question_id: string; tag_id: string }>(ids, (chunk) =>
      supabase.from(QUESTION_TAGS).select('question_id, tag_id').in('question_id', chunk),
    ),
    chunkedSelect<{ question_id: string; tag_id: string }>(ids, (chunk) =>
      supabase.from(DISMISSALS_TABLE).select('question_id, tag_id').in('question_id', chunk),
    ).catch((err) => {
      if (isMissingTableError(err)) return [];
      throw err;
    }),
    chunkedSelect<{ qb_question_id: string; test: { created_from: string | null } | null }>(
      ids.filter((id) => page.find((p) => p.id === id)?.origin === 'authored'),
      (chunk) =>
        supabase.from('nexus_test_questions').select('qb_question_id, test:nexus_tests(created_from)').in('qb_question_id', chunk),
    ),
  ]);

  const has = new Set(ownTags.map((r) => pairKey(r.question_id, r.tag_id)));
  const withTopic = new Set(
    ownTags.filter((r) => registry.subjectThemeIds.has(r.tag_id)).map((r) => r.question_id),
  );
  const dismissed = new Set(dismissedRows.map((r) => pairKey(r.question_id, r.tag_id)));
  const fromClass = new Set(
    classRows.filter((r) => CLASS_TEST_SOURCES.has(r.test?.created_from || '')).map((r) => r.qb_question_id),
  );

  return page.map((q) => {
    const text = questionMatchText(q.question_text, q.options);
    const also: SuggestedTagRef[] = [];
    for (const matcher of registry.matchers) {
      if (matcher.slug === tag.slug) continue;
      const other = registry.bySlug.get(matcher.slug);
      if (!other) continue;
      if (has.has(pairKey(q.id, other.id)) || dismissed.has(pairKey(q.id, other.id))) continue;
      if (matchTerms(text, matcher).length > 0) also.push({ tag_id: other.id, slug: other.slug, label: other.label });
    }
    return {
      ...q,
      also_suggested: also,
      source_label: sourceLabelFor(q.origin, fromClass.has(q.id)),
      has_topic_tag: withTopic.has(q.id),
    };
  });
}

// ============================================================================
// Writes
// ============================================================================

export interface TagPair {
  question_id: string;
  tag_id: string;
}

export const MAX_PAIRS = 500;

/**
 * Validate pairs from a request body: uuids, a known active tag, a question
 * that exists. Returns the valid pairs (de-duplicated) and how many were
 * dropped, so one stale id cannot fail the whole batch on a foreign key.
 */
export async function validatePairs(
  supabase: Db,
  registry: CoverageRegistry,
  raw: unknown,
): Promise<{ pairs: TagPair[]; skipped: number }> {
  if (!Array.isArray(raw) || raw.length === 0) throw new ApiError('pairs must be a non-empty array', 400);
  if (raw.length > MAX_PAIRS) throw new ApiError(`At most ${MAX_PAIRS} pairs per request`, 400);

  const unique = new Map<string, TagPair>();
  let skipped = 0;
  for (const p of raw as Array<Partial<TagPair>>) {
    const tag = isUuid(p?.tag_id) ? registry.byId.get(p!.tag_id!) : undefined;
    if (!isUuid(p?.question_id) || !tag || !tag.is_active) {
      skipped += 1;
      continue;
    }
    unique.set(pairKey(p!.question_id!, tag.id), { question_id: p!.question_id!, tag_id: tag.id });
  }

  const questionIds = [...new Set([...unique.values()].map((p) => p.question_id))];
  const existing = await chunkedSelect<{ id: string }>(questionIds, (chunk) =>
    supabase.from(QUESTIONS).select('id').in('id', chunk),
  );
  const known = new Set(existing.map((r) => r.id));
  const pairs: TagPair[] = [];
  for (const p of unique.values()) {
    if (known.has(p.question_id)) pairs.push(p);
    else skipped += 1;
  }
  return { pairs, skipped };
}

/** Group pairs by question, the shape addQuestionTagPairs takes. */
export function groupPairsByQuestion(pairs: TagPair[]): Array<{ question_id: string; tag_ids: string[] }> {
  const map = new Map<string, Set<string>>();
  for (const p of pairs) {
    let set = map.get(p.question_id);
    if (!set) map.set(p.question_id, (set = new Set()));
    set.add(p.tag_id);
  }
  return [...map.entries()].map(([question_id, tags]) => ({ question_id, tag_ids: [...tags] }));
}

/** Record "Not this topic" answers. Idempotent on the (question_id, tag_id) key. */
export async function writeDismissals(supabase: Db, pairs: TagPair[], dismissedBy: string | null): Promise<number> {
  if (pairs.length === 0) return 0;
  const rows = pairs.map((p) => ({ question_id: p.question_id, tag_id: p.tag_id, dismissed_by: dismissedBy }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase
      .from(DISMISSALS_TABLE)
      .upsert(rows.slice(i, i + 500), { onConflict: 'question_id,tag_id', ignoreDuplicates: true });
    if (error) {
      if (isMissingTableError(error)) {
        throw new ApiError('Dismissing suggestions is not set up on this database yet. Skip it for now.', 503);
      }
      throw error;
    }
  }
  return rows.length;
}
