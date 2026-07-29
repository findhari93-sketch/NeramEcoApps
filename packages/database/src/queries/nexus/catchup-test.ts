// @ts-nocheck — nexus_test_placements / nexus_tests.created_from are not in the
// generated Supabase types yet; regenerate after the migrations are applied.
//
// Imports test-repository (for composeTest/createPlacement) AND is imported by
// nobody in that direction, so the dependency graph stays acyclic:
//   catchup-journey  <-  test-repository  <-  catchup-test
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import { composeTest, createPlacement } from './test-repository';

/** Below this, 85% starts to mean "get every single one right". Worth saying so. */
const SHORT_TEST_THRESHOLD = 8;

/** The pass mark for a catch-up class test. */
export const CATCHUP_PASSING_PCT = 85;

/**
 * Every bank question that a recap's checkpoints already own.
 *
 * The recap editor mirrors each checkpoint's questions into nexus_qb_questions
 * and composes a per-section test placed on `class_recap_section`, so the whole
 * class's question set is recoverable by walking
 *   recap -> sections -> placements -> test questions -> qb_question_id
 * without re-reading the transcript or asking an AI for anything.
 */
export async function collectRecapBankQuestionIds(
  recapId: string,
  client?: TypedSupabaseClient,
): Promise<string[]> {
  const supabase = (client || getSupabaseAdminClient()) as any;

  const { data: sections } = await supabase
    .from('nexus_class_recap_sections')
    .select('id, sort_order')
    .eq('recap_id', recapId)
    .order('sort_order', { ascending: true });
  const sectionIds = (sections || []).map((s: any) => s.id);
  if (sectionIds.length === 0) return [];

  const { data: placements } = await supabase
    .from('nexus_test_placements')
    .select('test_id, context_id, sort_order')
    .eq('context_type', 'class_recap_section')
    .in('context_id', sectionIds)
    .eq('is_active', true);
  if (!placements || placements.length === 0) return [];

  const { data: tqs } = await supabase
    .from('nexus_test_questions')
    .select('test_id, qb_question_id, sort_order')
    .in(
      'test_id',
      placements.map((p: any) => p.test_id),
    );

  // Keep the teaching order: checkpoint 1's questions, then checkpoint 2's. A
  // paper that wanders back and forth through the class reads as a trick.
  const sectionRank = new Map<string, number>(sectionIds.map((id: string, i: number) => [id, i]));
  const testRank = new Map<string, number>(
    placements.map((p: any) => [p.test_id, sectionRank.get(p.context_id) ?? 999]),
  );

  const ordered = (tqs || [])
    .filter((t: any) => t.qb_question_id)
    .sort((a: any, b: any) => {
      const r = (testRank.get(a.test_id) ?? 999) - (testRank.get(b.test_id) ?? 999);
      return r !== 0 ? r : (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });

  return [...new Set(ordered.map((t: any) => t.qb_question_id))];
}

export interface BuildClassTestResult {
  test_id: string;
  placement_id: string;
  question_count: number;
  passing_pct: number;
  /** Questions that must be correct to clear the pass mark. */
  must_get_right: number;
  /** Set when the paper is short enough that the pass mark is near-perfect. */
  warning?: string;
}

/**
 * Build (or rebuild) the class test a catch-up student must pass at 85%.
 *
 * Assembled from the recap's own checkpoint questions rather than generated
 * fresh, for three reasons. There is one shared GEMINI_API_KEY across recap
 * generation, foundation, modules and class summaries, so a 429 is a global
 * outage and this feature must not double the per-class AI load. Those questions
 * have already been through the teacher's review in the recap editor, where a
 * separately generated paper would be unreviewed. And a reshuffled paper drawn
 * from the whole class is genuinely harder than the checkpoints, where a pass
 * needs only min_questions_to_pass inside its own two to four questions.
 *
 * Rebuilding is safe: the previous test is soft-deleted and its placement
 * deactivated first, so the single-active-test index stays satisfied and past
 * attempts are kept.
 */
export async function buildClassTestFromRecap(
  recapId: string,
  opts: { createdBy?: string | null } = {},
  client?: TypedSupabaseClient,
): Promise<BuildClassTestResult> {
  const supabase = (client || getSupabaseAdminClient()) as any;

  const { data: recap } = await supabase
    .from('nexus_class_recaps')
    .select('id, title, scheduled_class_id, classroom_id, status')
    .eq('id', recapId)
    .maybeSingle();
  if (!recap) throw new Error('RECAP_NOT_FOUND');
  if (!recap.scheduled_class_id) throw new Error('RECAP_HAS_NO_CLASS');

  const questionIds = await collectRecapBankQuestionIds(recapId, supabase);
  if (questionIds.length === 0) {
    // Deliberately not falling back to generating a paper from the transcript.
    // A recap with no checkpoints is a recap that has not been prepared yet, and
    // adding checkpoints fixes both the recap and the test. Silently generating
    // an unreviewed paper would hide that.
    throw new Error('NO_CHECKPOINT_QUESTIONS');
  }

  // Clear the previous test for this class so a rebuild does not trip the
  // one-active-test-per-class index.
  const { data: priorPlacements } = await supabase
    .from('nexus_test_placements')
    .select('id, test_id')
    .eq('context_type', 'catchup_class')
    .eq('context_id', recap.scheduled_class_id)
    .eq('is_active', true);
  for (const p of priorPlacements || []) {
    await supabase.from('nexus_test_placements').update({ is_active: false }).eq('id', p.id);
    await supabase.from('nexus_tests').update({ is_active: false }).eq('id', p.test_id);
  }

  const { data: cls } = await supabase
    .from('nexus_scheduled_classes')
    .select('title')
    .eq('id', recap.scheduled_class_id)
    .maybeSingle();

  const test = await composeTest(
    {
      title: `${cls?.title || recap.title || 'Class'}: class test`,
      description: 'Pass this to clear the class on your catch-up list.',
      questionIds,
      marks: 1,
      timerType: 'none',
      isPublished: true,
      isRepository: true,
      testKind: 'catchup_class',
      // Reversibility stamp: DELETE FROM nexus_tests WHERE created_from='catchup_class'
      createdFrom: 'catchup_class',
      createdBy: opts.createdBy ?? null,
      classroomId: recap.classroom_id ?? null,
      // Shuffled per attempt in the student route with a seed, not here: a
      // mid-attempt refresh must keep its order, a new attempt must not.
      shuffle: false,
    },
    supabase,
  );

  const placement = await createPlacement(
    {
      testId: test.id,
      contextType: 'catchup_class',
      contextId: recap.scheduled_class_id,
      passingPct: CATCHUP_PASSING_PCT,
      gating: { requires_recap_completion: true },
      createdBy: opts.createdBy ?? null,
    },
    supabase,
  );

  const mustGetRight = Math.ceil((CATCHUP_PASSING_PCT / 100) * questionIds.length);

  return {
    test_id: test.id,
    placement_id: placement.id,
    question_count: questionIds.length,
    passing_pct: CATCHUP_PASSING_PCT,
    must_get_right: mustGetRight,
    warning:
      questionIds.length < SHORT_TEST_THRESHOLD
        ? `Only ${questionIds.length} questions, so ${CATCHUP_PASSING_PCT}% means getting ${mustGetRight} of them right. Add more checkpoints to the recap for a fairer test.`
        : undefined,
  };
}

/** The active class test for a class, if one has been built. */
export async function getClassTestForClass(
  scheduledClassId: string,
  client?: TypedSupabaseClient,
): Promise<{ placement_id: string; test_id: string; passing_pct: number; question_count: number } | null> {
  const supabase = (client || getSupabaseAdminClient()) as any;

  const { data: placement } = await supabase
    .from('nexus_test_placements')
    .select('id, test_id, passing_pct')
    .eq('context_type', 'catchup_class')
    .eq('context_id', scheduledClassId)
    .eq('is_active', true)
    .maybeSingle();
  if (!placement) return null;

  const { count } = await supabase
    .from('nexus_test_questions')
    .select('id', { count: 'exact', head: true })
    .eq('test_id', placement.test_id);

  return {
    placement_id: placement.id,
    test_id: placement.test_id,
    passing_pct: placement.passing_pct ?? CATCHUP_PASSING_PCT,
    question_count: count || 0,
  };
}
