/**
 * The questions inside an assignment.
 *
 * There is no new question table here, and that is the whole design. An
 * assignment's paper is an ordinary composed test placed on the assignment, so
 * its questions live in nexus_qb_questions like every other question in the
 * product, marks live in nexus_test_questions.marks, and answering runs through
 * the same attempt lifecycle and the same grader as any test. The alternative,
 * a questions column on the assignment, would have meant a second question
 * model, a second grader, and a second place for them to disagree.
 *
 * What this module owns is the seam: turning what a teacher typed into bank
 * questions plus a test plus a placement, and reading it back.
 */
import { getSupabaseAdminClient } from '../../client';
import type { TypedSupabaseClient } from '../../client';
import { composeTest } from './test-repository';

/*
 * Cast at the relation name, matching drawings.ts. The generated `Database`
 * type does not describe the nexus tables, so a typed .from() rejects them
 * outright and, worse, sends the checker down an "excessively deep" inference
 * path that masks the real errors around it. The row shapes are asserted where
 * they are read instead.
 */
const QUESTIONS = 'nexus_qb_questions' as any;
const TESTS = 'nexus_tests' as any;
const TEST_QUESTIONS = 'nexus_test_questions' as any;
const PLACEMENTS = 'nexus_test_placements' as any;
const ASSIGNMENTS = 'nexus_class_assignments' as any;
const ATTEMPTS = 'nexus_test_attempts' as any;

/** What a machine can mark, and what it must not. */
export type AssignmentQuestionFormat = 'MCQ' | 'NUMERICAL' | 'SUBJECTIVE';

export interface AssignmentQuestionOption {
  key: string;
  text: string;
}

/** One question as the composer edits it and the API accepts it. */
export interface AssignmentQuestionInput {
  /** Present when editing a question that is already in the bank. */
  id?: string | null;
  question_text: string;
  question_image_url?: string | null;
  format: AssignmentQuestionFormat;
  /** MCQ only. */
  options?: AssignmentQuestionOption[];
  /** MCQ: the correct option key. NUMERICAL: the value. SUBJECTIVE: ignored. */
  correct_answer?: string | null;
  /** NUMERICAL only: how far off may still count as right. */
  answer_tolerance?: number | null;
  explanation?: string | null;
  marks: number;
}

/** One question as it is read back, with the answer key only when allowed. */
export interface AssignmentQuestionView {
  id: string;
  question_text: string;
  question_image_url: string | null;
  format: AssignmentQuestionFormat;
  options: AssignmentQuestionOption[];
  marks: number;
  sort_order: number;
  /** Withheld from students until their answers are locked in. */
  correct_answer?: string | null;
  answer_tolerance?: number | null;
  explanation?: string | null;
}

export interface AssignmentPaper {
  test_id: string;
  placement_id: string;
  questions: AssignmentQuestionView[];
  /** Marks a machine awards: everything except the SUBJECTIVE questions. */
  auto_marks: number;
  /** Marks the teacher must award by hand. */
  manual_marks: number;
  total_marks: number;
}

/** Normalise whatever the options column holds into {key,text} pairs. */
function readOptions(raw: unknown): AssignmentQuestionOption[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((o, i) => {
        if (typeof o === 'string') return { key: String.fromCharCode(97 + i), text: o };
        if (o && typeof o === 'object') {
          const rec = o as Record<string, unknown>;
          return {
            key: String(rec.key ?? String.fromCharCode(97 + i)),
            text: String(rec.text ?? rec.label ?? ''),
          };
        }
        return { key: String.fromCharCode(97 + i), text: '' };
      })
      .filter((o) => o.text.length > 0);
  }
  if (typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>)
      .filter(([, v]) => v != null && String(v).length > 0)
      .map(([k, v]) => ({ key: k.replace(/^option_/, ''), text: String(v) }));
  }
  return [];
}

/** SUBJECTIVE is the one format here a machine must never score. */
export function isAutoGradable(format: string | null | undefined): boolean {
  const f = String(format || '').toUpperCase();
  return f === 'MCQ' || f === 'NUMERICAL';
}

/**
 * Reject a paper that cannot be answered or cannot be marked, before any of it
 * reaches the database. Returns an error sentence, or null when it is sound.
 */
export function validateAssignmentQuestions(questions: AssignmentQuestionInput[]): string | null {
  if (!questions.length) return 'Add at least one question.';
  if (questions.length > 50) return 'An assignment can hold at most 50 questions.';

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const at = `Question ${i + 1}`;
    if (!q.question_text || !q.question_text.trim()) return `${at} needs its text.`;
    if (!Number.isFinite(q.marks) || q.marks <= 0) return `${at} needs marks above zero.`;

    if (q.format === 'MCQ') {
      const options = (q.options || []).filter((o) => o.text && o.text.trim());
      if (options.length < 2) return `${at} needs at least two options.`;
      if (!q.correct_answer) return `${at} needs its correct option marked.`;
      if (!options.some((o) => o.key === q.correct_answer)) {
        return `${at} has its correct answer set to an option that is not there.`;
      }
      const keys = new Set(options.map((o) => o.key));
      if (keys.size !== options.length) return `${at} has two options sharing a letter.`;
    }

    if (q.format === 'NUMERICAL') {
      if (q.correct_answer == null || String(q.correct_answer).trim() === '') {
        return `${at} needs its answer.`;
      }
      if (q.answer_tolerance != null && (!Number.isFinite(q.answer_tolerance) || q.answer_tolerance < 0)) {
        return `${at} has a tolerance that is not a positive number.`;
      }
    }
  }
  return null;
}

/**
 * True when a failure is only "this database has not run the migration yet".
 *
 * Postgres rejects an unknown enum label at parse time, so on a database where
 * 'assignment' has not been added to nexus_placement_context, merely ASKING
 * whether an assignment has a paper is an error. Every assignment page asks, so
 * without this the whole assignments section would 500 in the window between
 * the code shipping and the migration running, and locally until it is applied.
 *
 * Narrow on purpose: it matches the two shapes that mean "not migrated" and
 * nothing else. A genuine query fault still throws.
 */
function isPreMigrationError(error: unknown): boolean {
  const err = error as { code?: string; message?: string };
  const message = String(err?.message || '');
  return (
    // invalid input value for enum nexus_placement_context: "assignment"
    (err?.code === '22P02' && message.includes('nexus_placement_context')) ||
    // undefined_column, for a column the migration has not added yet
    err?.code === '42703'
  );
}

/** The active paper placed on an assignment, or null when it has none. */
export async function getAssignmentPlacement(
  assignmentId: string,
  client?: TypedSupabaseClient,
): Promise<{ id: string; test_id: string } | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(PLACEMENTS)
    .select('id, test_id')
    .eq('context_type', 'assignment')
    .eq('context_id', assignmentId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) {
    if (isPreMigrationError(error)) {
      // No migration means no papers exist, so "none" is the truthful answer.
      console.warn('assignment placements not migrated yet; treating as no paper');
      return null;
    }
    throw error;
  }
  return (data as any as { id: string; test_id: string }) || null;
}

/**
 * Read an assignment's paper.
 *
 * `withAnswers` is the only thing standing between a student and the answer key,
 * so it is a required argument with no default. A caller that has to decide
 * cannot forget to.
 */
export async function getAssignmentPaper(
  assignmentId: string,
  withAnswers: boolean,
  client?: TypedSupabaseClient,
): Promise<AssignmentPaper | null> {
  const supabase = client || getSupabaseAdminClient();
  const placement = await getAssignmentPlacement(assignmentId, supabase);
  if (!placement) return null;

  const { data: rows, error } = await supabase
    .from(TEST_QUESTIONS)
    .select('qb_question_id, marks, sort_order')
    .eq('test_id', placement.test_id)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  const list = (rows || []) as any as { qb_question_id: string; marks: number; sort_order: number }[];
  if (!list.length) {
    return {
      test_id: placement.test_id,
      placement_id: placement.id,
      questions: [],
      auto_marks: 0,
      manual_marks: 0,
      total_marks: 0,
    };
  }

  const { data: qs, error: qErr } = await supabase
    .from(QUESTIONS)
    .select('id, question_text, question_image_url, question_format, options, correct_answer, answer_tolerance, explanation_brief')
    .in('id', list.map((r) => r.qb_question_id));
  if (qErr) throw qErr;
  const byId = new Map((qs || []).map((q: any) => [q.id, q]));

  const questions: AssignmentQuestionView[] = list
    .map((row) => {
      const q = byId.get(row.qb_question_id);
      if (!q) return null;
      const format = String(q.question_format || 'MCQ').toUpperCase() as AssignmentQuestionFormat;
      const view: AssignmentQuestionView = {
        id: q.id,
        question_text: q.question_text || '',
        question_image_url: q.question_image_url ?? null,
        format,
        options: format === 'MCQ' ? readOptions(q.options) : [],
        marks: Number(row.marks) || 0,
        sort_order: row.sort_order,
      };
      if (withAnswers) {
        view.correct_answer = q.correct_answer ?? null;
        view.answer_tolerance = q.answer_tolerance ?? null;
        view.explanation = q.explanation_brief ?? null;
      }
      return view;
    })
    .filter((q): q is AssignmentQuestionView => q !== null);

  const auto = questions.filter((q) => isAutoGradable(q.format));
  const autoMarks = auto.reduce((sum, q) => sum + q.marks, 0);
  const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0);

  return {
    test_id: placement.test_id,
    placement_id: placement.id,
    questions,
    auto_marks: autoMarks,
    manual_marks: totalMarks - autoMarks,
    total_marks: totalMarks,
  };
}

/** Bank row shape for one authored question. */
function questionRow(q: AssignmentQuestionInput, createdBy: string | null) {
  return {
    question_text: q.question_text.trim(),
    question_image_url: q.question_image_url || null,
    question_format: q.format,
    options:
      q.format === 'MCQ'
        ? (q.options || []).filter((o) => o.text && o.text.trim()).map((o) => ({ key: o.key, text: o.text.trim() }))
        : null,
    // A subjective question has no answer key, and the column is nullable, so it
    // stores null rather than an empty string pretending to be one.
    correct_answer: q.format === 'SUBJECTIVE' ? null : String(q.correct_answer ?? '').trim(),
    answer_tolerance: q.format === 'NUMERICAL' ? q.answer_tolerance ?? null : null,
    explanation_brief: q.explanation?.trim() || null,
    difficulty: 'MEDIUM',
    exam_relevance: 'BOTH',
    // Both of these are constrained vocabularies on the bank: status is
    // draft/answer_keyed/complete/active, and origin is the nexus_qb_origin enum
    // (pyq, authored, student_recalled, imported). A teacher writing a question
    // in the composer is authoring one, and it is ready to use.
    status: 'active',
    origin: 'authored',
    is_active: true,
    created_by: createdBy,
  };
}

/**
 * Save the questions a teacher authored for one assignment.
 *
 * Replaces the paper wholesale rather than diffing it: the composer edits a
 * whole list and a teacher who deletes question 2 and reorders the rest means
 * exactly that. Questions carrying an id are updated in place so their existing
 * attempts and analytics stay attached; new ones are inserted into the bank.
 *
 * The old test row is deactivated rather than deleted, because attempts point at
 * it and marks already awarded must remain explicable.
 */
export async function saveAssignmentQuestions(
  assignmentId: string,
  questions: AssignmentQuestionInput[],
  opts: { title: string; createdBy: string | null; classroomId?: string | null },
  client?: TypedSupabaseClient,
): Promise<AssignmentPaper> {
  const supabase = client || getSupabaseAdminClient();
  const invalid = validateAssignmentQuestions(questions);
  if (invalid) throw new Error(invalid);

  // 1. Put every question in the bank, keeping ids where we already have them.
  const questionIds: string[] = [];
  for (const q of questions) {
    const row = questionRow(q, opts.createdBy);
    if (q.id) {
      const { data, error } = await supabase
        .from(QUESTIONS)
        .update(row)
        .eq('id', q.id)
        .select('id')
        .single();
      if (error) throw error;
      questionIds.push((data as any).id);
    } else {
      const { data, error } = await supabase.from(QUESTIONS).insert(row).select('id').single();
      if (error) throw error;
      questionIds.push((data as any).id);
    }
  }

  // 2. Compose the paper. A fresh test row each save keeps prior attempts
  //    pointing at the exact paper they sat.
  const previous = await getAssignmentPlacement(assignmentId, supabase);
  const { id: testId } = await composeTest(
    {
      title: opts.title.trim() || 'Assignment questions',
      questionIds,
      testKind: 'assignment',
      marks: questions.map((q) => q.marks),
      timerType: 'none',
      isPublished: true,
      isRepository: false,
      createdFrom: 'assignment',
      createdBy: opts.createdBy,
      classroomId: opts.classroomId ?? null,
    },
    supabase,
  );

  // 3. Retire the old placement BEFORE creating the new one: the partial unique
  //    index allows only one active placement per assignment.
  if (previous) {
    const { error } = await supabase
      .from(PLACEMENTS)
      .update({ is_active: false })
      .eq('id', previous.id);
    if (error) throw error;
    await supabase.from(TESTS).update({ is_active: false }).eq('id', previous.test_id);
  }

  // Revive-or-insert, never a plain insert: uq_placement_test_context has no
  // predicate, so a deactivated row still occupies (context_type, context_id,
  // test_id) forever and re-placing the same test would raise 23505.
  const { data: placement, error: pErr } = await supabase
    .from(PLACEMENTS)
    .upsert(
      {
        test_id: testId,
        context_type: 'assignment',
        context_id: assignmentId,
        is_visible: true,
        is_active: true,
        created_by: opts.createdBy,
      },
      { onConflict: 'context_type,context_id,test_id' },
    )
    .select('id')
    .single();
  if (pErr) throw pErr;

  // 4. Keep the assignment's own total in step with its questions, so the mark
  //    a student sees out of matches the paper they answered.
  const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0);
  const { error: aErr } = await supabase
    .from(ASSIGNMENTS)
    .update({ max_marks: totalMarks })
    .eq('id', assignmentId);
  if (aErr) throw aErr;

  const paper = await getAssignmentPaper(assignmentId, true, supabase);
  if (!paper) throw new Error('Saved the questions but could not read the paper back');
  return { ...paper, placement_id: (placement as any).id };
}

/**
 * A student's finished go at an assignment's paper, or null if they have not
 * answered yet.
 *
 * Answers on an assignment are one-shot, which is what earns the instant
 * results: a student who could answer again after seeing the key would simply be
 * copying it. So the presence of this row is also the lock, and both the student
 * page and the submit route read it for exactly that.
 */
export async function getAssignmentAttempt(
  testId: string,
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<{
  id: string;
  answers: Record<string, string>;
  score: number;
  total_marks: number;
  percentage: number;
  submitted_at: string | null;
} | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(ATTEMPTS)
    .select('id, answers, score, total_marks, percentage, submitted_at')
    .eq('test_id', testId)
    .eq('student_id', studentId)
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  const row = (data || [])[0] as any;
  if (!row) return null;
  return {
    id: row.id,
    answers: (row.answers as Record<string, string>) || {},
    score: Number(row.score) || 0,
    total_marks: Number(row.total_marks) || 0,
    percentage: Number(row.percentage) || 0,
    submitted_at: row.submitted_at ?? null,
  };
}

/** Every student's finished attempt at one paper, keyed by student id. */
export async function getAssignmentAttemptsByStudent(
  testId: string,
  client?: TypedSupabaseClient,
): Promise<Map<string, { score: number; total_marks: number; percentage: number; answers: Record<string, string> }>> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(ATTEMPTS)
    .select('student_id, answers, score, total_marks, percentage, submitted_at')
    .eq('test_id', testId)
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: true });
  if (error) throw error;
  const map = new Map<string, any>();
  // Ascending order with a plain set means the LAST (newest) wins, which is the
  // attempt that counts if a paper was ever re-answered.
  for (const row of (data || []) as any[]) {
    map.set(row.student_id, {
      score: Number(row.score) || 0,
      total_marks: Number(row.total_marks) || 0,
      percentage: Number(row.percentage) || 0,
      answers: (row.answers as Record<string, string>) || {},
    });
  }
  return map;
}

/** Remove an assignment's paper, keeping the rows for attempt history. */
export async function clearAssignmentQuestions(
  assignmentId: string,
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const placement = await getAssignmentPlacement(assignmentId, supabase);
  if (!placement) return;
  const { error } = await supabase.from(PLACEMENTS).update({ is_active: false }).eq('id', placement.id);
  if (error) throw error;
  await supabase.from(TESTS).update({ is_active: false }).eq('id', placement.test_id);
}
