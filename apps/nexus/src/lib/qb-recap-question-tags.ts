/**
 * Tag class checkpoint questions as they are written into the bank.
 *
 * WHY
 *
 * Every recap checkpoint question lands in nexus_qb_questions (origin
 * 'authored', composed into a 'recap_authored' test by
 * composeAndPlaceRecapSection), and the catch-up class test is built from those
 * same questions. None of them got a tag, so by 2026-09-25 they were most of
 * the 2,425 questions a topic filter could never find. The Tag coverage screen
 * clears that backlog; this stops it growing again.
 *
 * WHERE THE TAGS COME FROM
 *
 * 1. The class's own registry tags (nexus_class_tags), when the recap belongs
 *    to a scheduled class. The wrap-up and video meta write these from the same
 *    registry, a teacher can correct them, and 28 of the 30 class recaps on
 *    production carry them. Subject and theme tags only.
 * 2. On top of that, any THEME the keyword dictionary matches with high
 *    confidence (two or more different phrases). A class tagged only "History
 *    of Architecture" still gets its Taj Mahal questions under Islamic
 *    Architecture. Low-confidence matches are never written without a person:
 *    they wait on the Tag coverage screen.
 *
 * A recap with no class (a study-material video track, an ad-hoc recap) gets
 * step 2 only.
 *
 * Only questions with no subject or theme tag yet are touched, so a question a
 * teacher has already tagged by hand is never second-guessed. Adding is all this
 * does (addQuestionTagPairs): it never removes a tag.
 *
 * BEST EFFORT
 *
 * Tagging must never cost a teacher their checkpoints. Every failure is logged
 * and swallowed, and the caller's save has already happened by the time this
 * runs.
 */

import { addQuestionTagPairs } from '@neram/database';
import { describeError } from '@/lib/api-errors';
import { mergeTagKeywords } from '@/lib/qb-tag-keywords';
import { buildTagMatchers, matchTerms, questionMatchText, type TagMatcher } from '@/lib/qb-tag-suggest';

type Db = any;

const IN_CHUNK = 200;

interface RegistryRow {
  id: string;
  slug: string;
  group_type: string;
  aliases: string[] | null;
  is_active: boolean;
}

export interface PlanQuestion {
  id: string;
  question_text: string | null;
  options: unknown;
}

/**
 * Pure: which tags each question should get.
 *
 * `classTagIds` go on every question; each question also gets the theme tags
 * whose matcher finds two or more different phrases in it.
 */
export function planRecapQuestionTags(
  questions: PlanQuestion[],
  classTagIds: string[],
  themeMatchers: TagMatcher[],
  themeIdBySlug: Map<string, string>,
): Array<{ question_id: string; tag_ids: string[] }> {
  const out: Array<{ question_id: string; tag_ids: string[] }> = [];
  for (const q of questions) {
    const tags = new Set(classTagIds);
    const text = questionMatchText(q.question_text, q.options);
    if (text) {
      for (const matcher of themeMatchers) {
        const id = themeIdBySlug.get(matcher.slug);
        if (id && matchTerms(text, matcher).length >= 2) tags.add(id);
      }
    }
    if (tags.size > 0) out.push({ question_id: q.id, tag_ids: [...tags] });
  }
  return out;
}

async function selectIn<T>(supabase: Db, table: string, columns: string, column: string, ids: string[]): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await supabase.from(table).select(columns).in(column, ids.slice(i, i + IN_CHUNK));
    if (error) throw error;
    out.push(...((data || []) as T[]));
  }
  return out;
}

export interface RecapTaggingResult {
  /** Questions that received at least one tag. */
  tagged: number;
  source: 'class_tags' | 'keywords' | 'none';
}

/**
 * Tag the bank questions behind one recap's checkpoints. Call after the
 * sections are saved. Never throws.
 */
export async function tagRecapCheckpointQuestions(
  supabase: Db,
  recapId: string,
  opts: { createdBy?: string | null } = {},
): Promise<RecapTaggingResult> {
  try {
    const { data: recap, error: recapErr } = await supabase
      .from('nexus_class_recaps')
      .select('id, scheduled_class_id')
      .eq('id', recapId)
      .maybeSingle();
    if (recapErr) throw recapErr;
    if (!recap) return { tagged: 0, source: 'none' };

    const { data: sections, error: secErr } = await supabase
      .from('nexus_class_recap_sections')
      .select('id')
      .eq('recap_id', recapId);
    if (secErr) throw secErr;
    const sectionIds = (sections || []).map((s: { id: string }) => s.id);
    if (sectionIds.length === 0) return { tagged: 0, source: 'none' };

    const placements = await selectIn<{ test_id: string; is_active: boolean | null; context_type: string }>(
      supabase,
      'nexus_test_placements',
      'test_id, is_active, context_type',
      'context_id',
      sectionIds,
    );
    const testIds = [
      ...new Set(
        placements
          .filter((p) => p.context_type === 'class_recap_section' && p.is_active !== false)
          .map((p) => p.test_id),
      ),
    ];
    if (testIds.length === 0) return { tagged: 0, source: 'none' };

    const testQuestions = await selectIn<{ qb_question_id: string | null }>(
      supabase,
      'nexus_test_questions',
      'qb_question_id',
      'test_id',
      testIds,
    );
    const questionIds = [...new Set(testQuestions.map((r) => r.qb_question_id).filter((v): v is string => !!v))];
    if (questionIds.length === 0) return { tagged: 0, source: 'none' };

    const [{ data: registryData, error: regErr }, existing] = await Promise.all([
      supabase.from('nexus_qb_tags').select('id, slug, group_type, aliases, is_active'),
      selectIn<{ question_id: string; tag_id: string }>(
        supabase,
        'nexus_qb_question_tags',
        'question_id, tag_id',
        'question_id',
        questionIds,
      ),
    ]);
    if (regErr) throw regErr;
    const registry = (registryData || []) as RegistryRow[];
    const topicIds = new Set(
      registry.filter((t) => t.group_type === 'subject' || t.group_type === 'theme').map((t) => t.id),
    );

    // Only questions with no subject or theme tag: never second-guess a person.
    const alreadyTagged = new Set(existing.filter((r) => topicIds.has(r.tag_id)).map((r) => r.question_id));
    const untaggedIds = questionIds.filter((id) => !alreadyTagged.has(id));
    if (untaggedIds.length === 0) return { tagged: 0, source: 'none' };

    let classTagIds: string[] = [];
    if (recap.scheduled_class_id) {
      const { data: classTags, error: ctErr } = await supabase
        .from('nexus_class_tags')
        .select('tag_id')
        .eq('scheduled_class_id', recap.scheduled_class_id);
      if (ctErr) throw ctErr;
      const active = new Set(
        registry
          .filter((t) => t.is_active && (t.group_type === 'subject' || t.group_type === 'theme'))
          .map((t) => t.id),
      );
      const rows = (classTags || []) as Array<{ tag_id: string }>;
      classTagIds = [...new Set(rows.map((r) => r.tag_id))].filter((id) => active.has(id));
    }

    const themes = registry.filter((t) => t.is_active && t.group_type === 'theme');
    const themeMatchers = buildTagMatchers(mergeTagKeywords(themes));
    const themeIdBySlug = new Map(themes.map((t) => [t.slug, t.id]));

    const questions = await selectIn<PlanQuestion>(
      supabase,
      'nexus_qb_questions',
      'id, question_text, options',
      'id',
      untaggedIds,
    );
    const pairs = planRecapQuestionTags(questions, classTagIds, themeMatchers, themeIdBySlug);
    if (pairs.length === 0) return { tagged: 0, source: 'none' };

    await addQuestionTagPairs(pairs, opts.createdBy ?? null, supabase);
    return { tagged: pairs.length, source: classTagIds.length > 0 ? 'class_tags' : 'keywords' };
  } catch (err) {
    console.warn(`[recap question tags] recap ${recapId}: ${describeError(err)}`);
    return { tagged: 0, source: 'none' };
  }
}
