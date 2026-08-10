/**
 * Deleting a question from the bank, with the checks the FK graph does not give
 * you.
 *
 * Five tables reference nexus_qb_questions with ON DELETE CASCADE:
 *
 *   nexus_qb_student_attempts.question_id
 *   nexus_qb_study_marks.question_id
 *   nexus_qb_question_sources.question_id
 *   nexus_qb_question_tags.question_id
 *   nexus_test_questions.qb_question_id      <- the dangerous one
 *
 * The last means a hard delete silently removes a question from tests students
 * have ALREADY SAT, changing the denominator of scores that have been reported.
 * Postgres will do that without a murmur. deletePaperWithQuestions does exactly
 * that today with no guard at all.
 *
 * So the rule here is: nothing is deleted until we have counted what points at
 * it. `force` exists for the two soft blockers a human might reasonably
 * override, and deliberately cannot override test usage, because there is no
 * situation in which rewriting a sat paper is the right answer. Deactivate the
 * question instead: softDeleteQBQuestion is the tool for "stop showing this".
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import { refreshPaperStats } from './question-bank';

export interface QBDeletePreflight {
  question_id: string;
  question_text: string | null;
  is_active: boolean;
  original_paper_id: string | null;
  /** Students who have answered it. */
  attempts: number;
  /** Students who have bookmarked it. */
  study_marks: number;
  /** Composed tests holding it, including papers already sat. */
  test_questions: number;
  /** drawing_questions mirror rows pointing back at it. */
  drawing_mirrors: number;
  /** Drawing submissions marked against it, through the mirror or directly. */
  drawing_submissions: number;
  /** Junction rows that will be cleaned up. Informational, never a blocker. */
  tags: number;
  sources: number;
  /** Plain sentences a teacher can read. Empty means safe to delete. */
  blockers: string[];
  /** Whether `force` could get past what is blocking this one. */
  forceable: boolean;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

async function countBy(
  supabase: any,
  table: string,
  column: string,
  ids: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const { data, error } = await supabase.from(table).select(column).in(column, ids);
  if (error) throw error;
  for (const row of data || []) {
    const key = (row as any)[column];
    out.set(key, (out.get(key) || 0) + 1);
  }
  return out;
}

/**
 * Count everything that points at these questions and turn it into sentences.
 *
 * Never mutates. Safe to call from a GET so a dialog can explain itself before a
 * teacher presses anything.
 */
export async function preflightQBQuestionDelete(
  ids: string[],
  client?: TypedSupabaseClient,
): Promise<QBDeletePreflight[]> {
  const supabase: any = client || getSupabaseAdminClient();
  if (ids.length === 0) return [];

  const { data: questions, error } = await supabase
    .from('nexus_qb_questions')
    .select('id, question_text, is_active, original_paper_id')
    .in('id', ids);
  if (error) throw error;

  const [attempts, studyMarks, testQuestions, mirrors, tags, sources] = await Promise.all([
    countBy(supabase, 'nexus_qb_student_attempts', 'question_id', ids),
    countBy(supabase, 'nexus_qb_study_marks', 'question_id', ids),
    countBy(supabase, 'nexus_test_questions', 'qb_question_id', ids),
    countBy(supabase, 'drawing_questions', 'qb_question_id', ids),
    countBy(supabase, 'nexus_qb_question_tags', 'question_id', ids),
    countBy(supabase, 'nexus_qb_question_sources', 'question_id', ids),
  ]);

  // Drawing submissions reach a question two ways: directly through
  // exam_qb_question_id, and through the drawing_questions mirror. Both have to
  // be counted or a marked exam drawing looks like an unreferenced question.
  const directSubs = await countBy(supabase, 'drawing_submissions', 'exam_qb_question_id', ids);

  const mirrorIdsByQuestion = new Map<string, string[]>();
  if (mirrors.size > 0) {
    const { data: mirrorRows, error: mirrorError } = await supabase
      .from('drawing_questions')
      .select('id, qb_question_id')
      .in('qb_question_id', ids);
    if (mirrorError) throw mirrorError;
    for (const row of mirrorRows || []) {
      const list = mirrorIdsByQuestion.get((row as any).qb_question_id) || [];
      list.push((row as any).id);
      mirrorIdsByQuestion.set((row as any).qb_question_id, list);
    }
  }
  const allMirrorIds = Array.from(mirrorIdsByQuestion.values()).flat();
  const mirrorSubs = await countBy(supabase, 'drawing_submissions', 'question_id', allMirrorIds);

  return (questions || []).map((q: any) => {
    const mirrorSubCount = (mirrorIdsByQuestion.get(q.id) || []).reduce(
      (sum, mirrorId) => sum + (mirrorSubs.get(mirrorId) || 0),
      0,
    );
    const row: QBDeletePreflight = {
      question_id: q.id,
      question_text: q.question_text ?? null,
      is_active: q.is_active === true,
      original_paper_id: q.original_paper_id ?? null,
      attempts: attempts.get(q.id) || 0,
      study_marks: studyMarks.get(q.id) || 0,
      test_questions: testQuestions.get(q.id) || 0,
      drawing_mirrors: mirrors.get(q.id) || 0,
      drawing_submissions: (directSubs.get(q.id) || 0) + mirrorSubCount,
      tags: tags.get(q.id) || 0,
      sources: sources.get(q.id) || 0,
      blockers: [],
      forceable: true,
    };

    if (row.test_questions > 0) {
      row.blockers.push(
        `Used in ${plural(row.test_questions, 'test', 'tests')}. Deleting it would remove it from papers students have already sat and change their scores.`,
      );
      row.forceable = false;
    }
    if (row.attempts > 0) {
      row.blockers.push(
        `${plural(row.attempts, 'student answer', 'student answers')} recorded against it.`,
      );
    }
    if (row.study_marks > 0) {
      row.blockers.push(`Bookmarked by ${plural(row.study_marks, 'student', 'students')}.`);
    }
    if (row.drawing_submissions > 0) {
      row.blockers.push(
        `${plural(row.drawing_submissions, 'drawing submission', 'drawing submissions')} exist for it, some may be marked.`,
      );
    }

    return row;
  });
}

export interface QBDeleteResult {
  deleted: string[];
  refused: QBDeletePreflight[];
}

/**
 * Hard delete questions that nothing depends on.
 *
 * Deletes the junction rows explicitly rather than leaning on the cascades, for
 * two reasons: a mirror row's FK is ON DELETE SET NULL so it would otherwise
 * survive as an orphan pointing at nothing, and an explicit delete is auditable
 * in a way "Postgres took care of it" is not.
 *
 * `force` skips the soft blockers (attempts, bookmarks, submissions). It never
 * skips test usage.
 */
export async function hardDeleteQBQuestions(
  ids: string[],
  opts: { force?: boolean; actorId: string },
  client?: TypedSupabaseClient,
): Promise<QBDeleteResult> {
  const supabase: any = client || getSupabaseAdminClient();
  if (ids.length === 0) return { deleted: [], refused: [] };

  const preflight = await preflightQBQuestionDelete(ids, client);

  const refused: QBDeletePreflight[] = [];
  const deletable: QBDeletePreflight[] = [];
  for (const row of preflight) {
    if (row.blockers.length === 0) {
      deletable.push(row);
    } else if (opts.force && row.forceable) {
      deletable.push(row);
    } else {
      refused.push(row);
    }
  }

  const deletableIds = deletable.map((r) => r.question_id);
  if (deletableIds.length === 0) return { deleted: [], refused };

  // Mirrors first: the FK is SET NULL, so a mirror left behind becomes an
  // orphan prompt in the practice bank with no question to explain it.
  const { data: mirrorRows, error: mirrorReadError } = await supabase
    .from('drawing_questions')
    .select('id, qb_question_id')
    .in('qb_question_id', deletableIds);
  if (mirrorReadError) throw mirrorReadError;

  const mirrorIds = (mirrorRows || []).map((r: any) => r.id);
  if (mirrorIds.length > 0) {
    const { error } = await supabase.from('drawing_questions').delete().in('id', mirrorIds);
    if (error) throw error;
  }

  for (const table of ['nexus_qb_question_tags', 'nexus_qb_question_sources'] as const) {
    const { error } = await supabase.from(table).delete().in('question_id', deletableIds);
    if (error) throw error;
  }

  const { error: deleteError } = await supabase
    .from('nexus_qb_questions')
    .delete()
    .in('id', deletableIds);
  if (deleteError) throw deleteError;

  // There is no audit table for the bank, and this is the one operation in it
  // that cannot be undone. The log line is the only record of who did it.
  console.info(
    '[hardDeleteQBQuestions] actor',
    opts.actorId,
    'deleted',
    deletableIds.length,
    'questions',
    opts.force ? '(forced past soft blockers)' : '',
    deletableIds.join(','),
  );

  // questions_parsed / questions_answer_keyed / questions_complete are derived
  // and are now stale on every paper touched.
  //
  // nexus_qb_original_papers.total_questions is deliberately NOT adjusted. It is
  // the count printed on the real exam paper, written once at import and used as
  // a cross-check when a teacher re-uploads. Leaving it at 92 while the bank
  // holds 90 is the honest signal that two questions were never extracted,
  // which for the JEE drawing sheet is exactly what happened.
  const paperIds = Array.from(
    new Set(deletable.map((r) => r.original_paper_id).filter((p): p is string => !!p)),
  );
  for (const paperId of paperIds) {
    await refreshPaperStats(paperId, client);
  }

  return { deleted: deletableIds, refused };
}
