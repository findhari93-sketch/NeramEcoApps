/**
 * Original papers, as an object a student can open.
 *
 * THE TWO TABLES
 *
 * A paper lives in nexus_qb_original_papers. Which questions belong to it lives
 * in nexus_qb_question_sources, one row per (question, exam, year, session,
 * shift). They are separate on purpose: a question that appeared in 2019 and
 * again in 2023 has two source rows and belongs to two papers, which a single
 * questions.original_paper_id could never express. That column still exists and
 * still drives the upload and answer-key workflow; it is not the membership.
 *
 * So: PAPERS TABLE IS THE OBJECT, SOURCES TABLE IS THE MEMBERSHIP. The join
 * between them is the tuple (exam_type, year, session, shift), which is exactly
 * the tuple both tables index with COALESCE(...,'') semantics. paperKey() below
 * reproduces those semantics in TypeScript so the two cannot disagree.
 *
 * This module exists because they DID disagree: the teacher's paper list read
 * the papers table, the student's "Practice by Year Paper" grid read the sources
 * table, and nothing joined them, so a paper could be complete on one screen and
 * absent from the other.
 *
 * THE THREE FACES
 *
 * read     the linked PDF, held in Study Materials
 * practice the questions, answered one at a time in the browser
 * test     the whole paper, sat through the one player
 *
 * Each face can be unavailable (staff never provided it), available, in
 * progress, or done. A card hides an unavailable face rather than disabling it,
 * because a Read button that opens nothing is worse than no Read button.
 *
 * COST
 *
 * The grid reads are deliberately flat: whatever the paper count, listing costs
 * a fixed handful of queries rather than a few per paper. The teacher's own
 * papers page fans out one request per paper and is noticeably slow at 26.
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type {
  NexusQBOriginalPaper,
  NexusQBPaperCard,
  NexusQBPaperDetail,
  NexusQBPaperGroup,
  NexusQBPaperMatrix,
  NexusQBPaperMatrixCell,
  NexusQBPaperMatrixRow,
  NexusQBPaperTest,
  NexusStudyFileDTO,
  QBExamType,
  QBPaperFaceState,
  QBPaperFaceStates,
  QBShift,
} from '../../types';
import { QB_EXAM_TYPE_LABELS } from '../../types';
import { buildPaperBlueprint, marksForQuestions } from './paper-marking';
// Pure module, only depends on ../../types, so no cycle back into this one.
import { effectiveAttemptScore } from './exam-score';
import { getPaperSectionBreakdown } from './question-bank';
import {
  composeTest,
  createPlacement,
  getComposedTestQuestions,
  getPlacementsByContext,
  getTestMeta,
} from './test-repository';
import {
  deriveFileStatus,
  effectiveDownloadable,
  fileKind,
  fileRecording,
  getFileById,
  getFileProgressMap,
  getFolderById,
  grantCoversFile,
  isFolderVisibleToStudent,
  isNewFile,
  listActiveGrantsForStudent,
} from './study-materials';

const PAPERS = 'nexus_qb_original_papers';
const SOURCES = 'nexus_qb_question_sources';
const QUESTIONS = 'nexus_qb_questions';
const QB_ATTEMPTS = 'nexus_qb_student_attempts';
const TEST_ATTEMPTS = 'nexus_test_attempts';
const PLACEMENTS = 'nexus_test_placements';
const ENROLLMENTS = 'nexus_enrollments';

/** Supabase caps a single .in() list; stay well under it. */
const IN_CHUNK = 400;
/** PostgREST's default page. Anything unbounded has to walk. */
const PAGE = 1000;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ============================================================================
// The tuple that joins the two tables
// ============================================================================

interface PaperTuple {
  exam_type: string;
  year: number;
  session: string | null;
  shift: string | null;
}

/**
 * The join key, matching the database's own uniqueness rules.
 *
 * Both uq_nexus_qb_papers_exam_year_session_shift and the sources table's unique
 * index key on (exam_type, year, COALESCE(session,''), COALESCE(shift,'')). A
 * null session and an empty-string session are therefore the SAME paper as far
 * as the database is concerned, and `?? ''` here says so in TypeScript. Using
 * JSON or template-literal null would split them and silently halve a paper.
 */
export function paperKey(t: PaperTuple): string {
  return `${t.exam_type}|${t.year}|${t.session ?? ''}|${t.shift ?? ''}`;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

const SHIFT_LABEL: Record<string, string> = {
  forenoon: 'Forenoon',
  afternoon: 'Afternoon',
};

/**
 * The two names a paper goes by.
 *
 * `title` stands alone ("NATA 2025 Session 1 (Forenoon)"). `short_title` drops
 * the exam, because on the grid it always sits under a heading that already says
 * NATA. Assembled here, once, rather than in each of the four components that
 * show a paper name.
 */
export function paperTitles(t: PaperTuple): { title: string; short_title: string } {
  const exam = QB_EXAM_TYPE_LABELS[t.exam_type as QBExamType] || t.exam_type;
  const parts: string[] = [String(t.year)];
  if (t.session) parts.push(titleCase(t.session));
  if (t.shift) parts.push(`(${SHIFT_LABEL[t.shift] || titleCase(t.shift)})`);
  const short = parts.join(' ');
  return { title: `${exam} ${short}`, short_title: short };
}

// ============================================================================
// Membership: which active questions belong to which paper
// ============================================================================

/**
 * paper tuple key -> ordered active question ids.
 *
 * Two round trips regardless of paper count. The alternative, asking per paper,
 * is what makes the teacher papers page slow.
 *
 * Only questions that are BOTH is_active and status='active' count. A paper
 * mid-upload has rows in sources already, and counting them would tell a student
 * a paper holds 62 questions that the browser then refuses to show them.
 */
async function loadPaperQuestionIds(
  papers: PaperTuple[],
  client?: TypedSupabaseClient,
): Promise<Map<string, string[]>> {
  const supabase = client || getSupabaseAdminClient();
  const out = new Map<string, string[]>();
  if (papers.length === 0) return out;

  const examTypes = [...new Set(papers.map((p) => p.exam_type))];
  const years = [...new Set(papers.map((p) => p.year))];
  const wanted = new Set(papers.map(paperKey));

  // 1. Every source row for the exams and years in play.
  type SourceRow = PaperTuple & { question_id: string; question_number: number | null };
  const sources: SourceRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(SOURCES as any)
      .select('question_id, exam_type, year, session, shift, question_number')
      .in('exam_type', examTypes)
      .in('year', years)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data || []) as unknown as SourceRow[];
    sources.push(...rows);
    if (rows.length < PAGE) break;
  }

  const relevant = sources.filter((r) => wanted.has(paperKey(r)));
  if (relevant.length === 0) return out;

  // 2. Of those questions, which are actually live.
  const ids = [...new Set(relevant.map((r) => r.question_id))];
  const active = new Set<string>();
  for (const part of chunk(ids, IN_CHUNK)) {
    const { data, error } = await supabase
      .from(QUESTIONS as any)
      .select('id')
      .in('id', part)
      .eq('is_active', true)
      .eq('status', 'active');
    if (error) throw error;
    for (const row of (data || []) as unknown as { id: string }[]) active.add(row.id);
  }

  // 3. Group, in paper order, so a mock composed from this reads 1, 2, 3.
  const grouped = new Map<string, SourceRow[]>();
  for (const row of relevant) {
    if (!active.has(row.question_id)) continue;
    const key = paperKey(row);
    const list = grouped.get(key);
    if (list) list.push(row);
    else grouped.set(key, [row]);
  }
  for (const [key, rows] of grouped) {
    rows.sort((a, b) => (a.question_number ?? 0) - (b.question_number ?? 0));
    out.set(key, [...new Set(rows.map((r) => r.question_id))]);
  }
  return out;
}

/** The active question ids of one paper, in paper order. */
export async function getPaperQuestionIds(
  paper: PaperTuple,
  client?: TypedSupabaseClient,
): Promise<string[]> {
  const map = await loadPaperQuestionIds([paper], client);
  return map.get(paperKey(paper)) || [];
}

// ============================================================================
// The placed mock
// ============================================================================

/**
 * The active mock on a paper, or null.
 *
 * Reads passing_pct the way resolvePassingPct will decide it at grade time
 * (placement first, then the test's own passing_marks), so the number shown to a
 * student before they start is the number they are then judged by.
 */
export async function getPlacedPaperTest(
  paperId: string,
  client?: TypedSupabaseClient,
): Promise<Omit<NexusQBPaperTest, 'attempts_used' | 'official_attempt_done' | 'best_pct'> | null> {
  const supabase = client || getSupabaseAdminClient();
  const placements = await getPlacementsByContext('qb_paper', paperId, supabase);
  const placement = placements[0];
  if (!placement) return null;

  const meta = await getTestMeta(placement.test_id, supabase);
  if (!meta || !meta.is_active) return null;

  const questions = await getComposedTestQuestions(placement.test_id, false, supabase);
  const totalMarks = questions.reduce((sum, q) => sum + (Number(q.marks) || 1), 0);

  return {
    test_id: placement.test_id,
    placement_id: placement.id,
    title: meta.title || 'Full paper',
    question_count: questions.length,
    duration_minutes: meta.duration_minutes ?? null,
    passing_pct:
      placement.passing_pct != null
        ? Number(placement.passing_pct)
        : meta.passing_marks != null && totalMarks > 0
          ? Math.round((Number(meta.passing_marks) / totalMarks) * 100)
          : null,
  };
}

/**
 * Attach a test to a paper as its mock.
 *
 * uq_placement_test_context is NOT partial: it owns (context_type, context_id,
 * test_id) whether or not the row is active. Unlinking sets is_active = false
 * but leaves the row, so relinking the same test with a fresh insert raises
 * 23505. Revive instead. linkTestToStudyFile learned this the same way.
 */
export async function linkTestToQBPaper(
  input: { paperId: string; testId: string; passingPct?: number | null; createdBy?: string | null },
  client?: TypedSupabaseClient,
): Promise<NexusQBPaperTest> {
  const supabase = client || getSupabaseAdminClient();

  const meta = await getTestMeta(input.testId, supabase);
  if (!meta || !meta.is_active) throw new Error('TEST_NOT_FOUND');
  const questions = await getComposedTestQuestions(input.testId, false, supabase);
  if (questions.length === 0) throw new Error('TEST_HAS_NO_QUESTIONS');

  const passingPct =
    input.passingPct != null && Number.isFinite(Number(input.passingPct))
      ? Math.min(Math.max(Math.round(Number(input.passingPct)), 1), 100)
      : null;

  // uq_placement_single_test allows one active placement here, so anything else
  // stands down before this stands up.
  await supabase
    .from(PLACEMENTS as any)
    .update({ is_active: false })
    .eq('context_type', 'qb_paper')
    .eq('context_id', input.paperId)
    .eq('is_active', true)
    .neq('test_id', input.testId);

  const { data: existing } = await supabase
    .from(PLACEMENTS as any)
    .select('id')
    .eq('context_type', 'qb_paper')
    .eq('context_id', input.paperId)
    .eq('test_id', input.testId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from(PLACEMENTS as any)
      .update({ is_active: true, is_visible: true, passing_pct: passingPct })
      .eq('id', (existing as unknown as { id: string }).id);
  } else {
    await createPlacement(
      {
        testId: input.testId,
        contextType: 'qb_paper',
        contextId: input.paperId,
        passingPct,
        createdBy: input.createdBy ?? null,
        // Deliberately no gating.attempt_limit. The engine counts every
        // submitted attempt against that limit regardless of mode, so a limit of
        // 1 would block the revision retakes this feature promises, not just the
        // second scored sitting. Unlimited attempts, best official score kept.
        gating: {},
      },
      supabase,
    );
  }

  const placed = await getPlacedPaperTest(input.paperId, supabase);
  if (!placed) throw new Error('LINK_FAILED');
  return { ...placed, attempts_used: 0, official_attempt_done: false, best_pct: null };
}

/** Detach the mock. Soft: the test and every attempt survive. */
export async function unlinkTestFromQBPaper(
  paperId: string,
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase
    .from(PLACEMENTS as any)
    .update({ is_active: false })
    .eq('context_type', 'qb_paper')
    .eq('context_id', paperId)
    .eq('is_active', true);
  if (error) throw error;
}

/**
 * Build a mock from everything the paper holds, and place it.
 *
 * testKind 'full' rather than 'mock': both are teacher labels for a class test,
 * and this IS the full paper, not a model of one.
 *
 * The duration is the paper's own when it has one. Falling back to a guess would
 * put a number on screen that looks authoritative and is not, so a paper with no
 * recorded duration gets an untimed test and the interface says so.
 */
export async function generatePaperMockTest(
  input: { paperId: string; createdBy?: string | null; passingPct?: number | null },
  client?: TypedSupabaseClient,
): Promise<NexusQBPaperTest> {
  const supabase = client || getSupabaseAdminClient();

  const paper = await getPaperById(input.paperId, supabase);
  if (!paper) throw new Error('PAPER_NOT_FOUND');

  const questionIds = await getPaperQuestionIds(paper, supabase);
  if (questionIds.length === 0) throw new Error('PAPER_HAS_NO_ACTIVE_QUESTIONS');

  const { title } = paperTitles(paper);
  const duration = paper.duration_minutes ?? null;

  // The published marking scheme for this exam, expanded per question.
  //
  // Until now a paper mock was composed with no marks argument at all, so every
  // question was worth 1 and nothing was penalised: a JEE Paper 2 "full paper"
  // scored out of 77 instead of 200 and never deducted for a wrong answer.
  // buildPaperBlueprint and marksForQuestions existed the whole time but lived
  // in the Nexus app, which this package cannot import from. They now live in
  // paper-marking.ts, which is what makes this call possible.
  const breakdown = await getPaperSectionBreakdown(input.paperId, supabase);
  const blueprint = buildPaperBlueprint(breakdown, paper.exam_type);

  const { data: questionRows } = await supabase
    .from('nexus_qb_questions')
    .select('id, section, categories, question_format')
    .in('id', questionIds);
  const byId = new Map((questionRows || []).map((q: any) => [q.id, q]));
  // Aligned with questionIds, in that order: marksForQuestions reads each
  // question's own section rather than assuming sections are contiguous.
  const orderedQuestions = questionIds.map(
    (id) => byId.get(id) ?? { section: null, categories: null, question_format: null },
  );
  const { marks, negativeMarks } = marksForQuestions(orderedQuestions, blueprint);

  const test = await composeTest(
    {
      title,
      description: `The complete ${title} paper.`,
      questionIds,
      testKind: 'full',
      timerType: duration ? 'full' : 'none',
      durationMinutes: duration,
      marks,
      negativeMarks,
      shuffle: false, // A real paper is sat in its real order.
      // Sections keep their paper order and the questions inside them shuffle,
      // so two students sitting the same paper at the same time cannot simply
      // read each other's answers off in order.
      shuffleSections: true,
      isPublished: true,
      isRepository: true,
      createdFrom: 'qb_paper',
      createdBy: input.createdBy ?? null,
    },
    supabase,
  );

  return linkTestToQBPaper(
    {
      paperId: input.paperId,
      testId: test.id,
      passingPct: input.passingPct ?? null,
      createdBy: input.createdBy ?? null,
    },
    supabase,
  );
}

// ============================================================================
// Staff edits
// ============================================================================

export async function getPaperById(
  paperId: string,
  client?: TypedSupabaseClient,
): Promise<NexusQBOriginalPaper | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data } = await supabase.from(PAPERS as any).select('*').eq('id', paperId).maybeSingle();
  return (data as unknown as NexusQBOriginalPaper) || null;
}

/** Point a paper at its original PDF, or clear it by passing null. */
export async function setPaperStudyFile(
  paperId: string,
  studyFileId: string | null,
  client?: TypedSupabaseClient,
): Promise<NexusQBOriginalPaper> {
  const supabase = client || getSupabaseAdminClient();

  if (studyFileId) {
    const file = await getFileById(studyFileId, supabase);
    if (!file || (file as { is_deleted?: boolean }).is_deleted) throw new Error('FILE_NOT_FOUND');
  }

  const { data, error } = await supabase
    .from(PAPERS as any)
    .update({ study_file_id: studyFileId })
    .eq('id', paperId)
    .select('*')
    .single();
  if (error) throw error;
  return data as unknown as NexusQBOriginalPaper;
}

/**
 * Why a paper cannot be published yet, or null when it can.
 *
 * A paper with neither questions nor a PDF would render as a card that opens an
 * empty screen. Returning the reason rather than a boolean lets the switch say
 * what is missing instead of just refusing.
 */
export async function paperPublishBlocker(
  paperId: string,
  client?: TypedSupabaseClient,
): Promise<string | null> {
  const supabase = client || getSupabaseAdminClient();
  const paper = await getPaperById(paperId, supabase);
  if (!paper) return 'This paper no longer exists.';
  if (paper.study_file_id) return null;
  const questionIds = await getPaperQuestionIds(paper, supabase);
  if (questionIds.length > 0) return null;
  return 'Link the original PDF or activate at least one question before publishing.';
}

export async function setPaperStudentVisibility(
  paperId: string,
  visible: boolean,
  client?: TypedSupabaseClient,
): Promise<NexusQBOriginalPaper> {
  const supabase = client || getSupabaseAdminClient();

  if (visible) {
    const blocker = await paperPublishBlocker(paperId, supabase);
    if (blocker) throw new Error(blocker);
  }

  const { data, error } = await supabase
    .from(PAPERS as any)
    .update({ is_student_visible: visible })
    .eq('id', paperId)
    .select('*')
    .single();
  if (error) throw error;
  return data as unknown as NexusQBOriginalPaper;
}

export interface BulkPublishResult {
  published: number;
  already_visible: number;
  /** Papers with neither questions nor a PDF, named so the gap is actionable. */
  skipped: { id: string; label: string }[];
}

/** How a skipped paper is named back to the teacher, so they can go find it. */
export function paperLabel(paper: Pick<NexusQBOriginalPaper, 'exam_type' | 'year' | 'session' | 'shift'>): string {
  const suffix = [paper.session, paper.shift].filter(Boolean).join(' ');
  return `${paper.exam_type} ${paper.year}${suffix ? ` ${suffix}` : ''}`;
}

/**
 * Split papers into publish / skip / already, without touching the database.
 *
 * The gate matches `paperPublishBlocker`: a paper needs questions or a PDF,
 * because with neither it would draw a card whose three faces are all dead.
 */
export function partitionForPublish(
  papers: NexusQBOriginalPaper[],
  hasQuestions: (paper: NexusQBOriginalPaper) => boolean,
): { ready: string[]; skipped: { id: string; label: string }[]; alreadyVisible: number } {
  const ready: string[] = [];
  const skipped: { id: string; label: string }[] = [];
  let alreadyVisible = 0;

  for (const paper of papers) {
    if (paper.is_student_visible) {
      alreadyVisible++;
      continue;
    }
    if (hasQuestions(paper) || paper.study_file_id) {
      ready.push(paper.id);
    } else {
      skipped.push({ id: paper.id, label: paperLabel(paper) });
    }
  }

  return { ready, skipped, alreadyVisible };
}

/**
 * Publish every paper that has something to show, in one press.
 *
 * Publishing is per paper by design, but the first run of this feature means
 * doing it two dozen times before a student sees anything, and a switch buried
 * one tab deep in each paper reads as a chore rather than a decision. This
 * applies the same readiness gate `paperPublishBlocker` uses, and reports what
 * it refused rather than failing the whole batch on one unready paper.
 *
 * Unpublishing stays deliberate and stays per paper: taking something away from
 * students who have started it should never be one press.
 */
export async function publishReadyPapers(
  client?: TypedSupabaseClient,
): Promise<BulkPublishResult> {
  const supabase = client || getSupabaseAdminClient();

  const { data: rows, error } = await supabase
    .from(PAPERS as any)
    .select('*')
    .order('year', { ascending: false });
  if (error) throw error;
  const papers = (rows || []) as unknown as NexusQBOriginalPaper[];
  if (papers.length === 0) return { published: 0, already_visible: 0, skipped: [] };

  // One read for every paper's questions rather than a blocker call each.
  const questionIdsByPaper = await loadPaperQuestionIds(papers, supabase);

  const { ready, skipped, alreadyVisible } = partitionForPublish(
    papers,
    (paper) => (questionIdsByPaper.get(paperKey(paper)) || []).length > 0,
  );

  for (const batch of chunk(ready, IN_CHUNK)) {
    const { error: updateError } = await supabase
      .from(PAPERS as any)
      .update({ is_student_visible: true })
      .in('id', batch);
    if (updateError) throw updateError;
  }

  return { published: ready.length, already_visible: alreadyVisible, skipped };
}

// ============================================================================
// Progress: the three faces, per student
// ============================================================================

interface TestOutcome {
  attempts: number;
  best_pct: number | null;
  passed: boolean;
}

export function faceFromCounts(
  provided: boolean,
  touched: boolean,
  finished: boolean,
): QBPaperFaceState {
  if (!provided) return 'unavailable';
  if (finished) return 'done';
  return touched ? 'in_progress' : 'available';
}

const ALL_FACES = ['read', 'practice', 'test'] as const;

/**
 * Has this student actually done anything with the paper?
 *
 * The one rule the matrix uses to decide whether a cell exists at all, so it
 * lives here rather than inline. Written inline first as `!== 'available'`,
 * which silently counted 'unavailable' as engagement: on a paper with no PDF
 * linked, the read face is unavailable for EVERYBODY, so all 28 students in a
 * cohort looked touched and the sparse payload stopped being sparse. Only the
 * two states a student can reach by doing something count.
 */
export function hasEngaged(faces: QBPaperFaceStates): boolean {
  return ALL_FACES.some((f) => faces[f] === 'in_progress' || faces[f] === 'done');
}

/**
 * Every face the staff actually provided is finished.
 *
 * Vacuously true is refused: a paper offering nothing is not a paper somebody
 * completed, so an all-unavailable card counts as zero, not one.
 */
export function isPaperComplete(faces: QBPaperFaceStates): boolean {
  const provided = ALL_FACES.filter((f) => faces[f] !== 'unavailable');
  return provided.length > 0 && provided.every((f) => faces[f] === 'done');
}

/**
 * Best and count over a student's OFFICIAL attempts only.
 *
 * Revision retakes are stored in the same table and carry a percentage, but the
 * whole point of mode='revision' is that it does not touch the record. Counting
 * them would let a student lower their best by practising, which is the opposite
 * of the intent.
 *
 * Read through effectiveAttemptScore rather than off `percentage`, because a
 * paper with a drawing section is scored in two stages. `percentage` holds the
 * objective half and never moves again; the teacher's marks land in final_*.
 * Reading the raw column would leave a 92 question paper's best score frozen at
 * whatever the 90 machine-marked questions came to.
 */
export function summariseAttempts(
  rows: Array<{
    percentage: number | null;
    status: string | null;
    mode: string | null;
    final_percentage?: number | null;
    finalised_at?: string | null;
  }>,
  passingPct: number | null,
): TestOutcome {
  const official = rows.filter(
    (r) => r.status === 'submitted' && (r.mode == null || r.mode === 'official'),
  );
  const best = official.reduce<number | null>((acc, r) => {
    if (r.percentage == null && r.final_percentage == null) return acc;
    const pct = effectiveAttemptScore(r).percentage;
    return acc == null ? pct : Math.max(acc, pct);
  }, null);
  // A placement with no passing mark is read as "no bar", exactly as
  // resolvePassingPct does, so sitting it at all counts as done.
  const passed = best != null && (passingPct == null || best >= passingPct);
  return { attempts: official.length, best_pct: best, passed };
}

interface StudentProgressInputs {
  /** file id -> read state */
  reads: Map<string, { completed_at: string | null; active_seconds: number }>;
  /** question ids the student has attempted */
  attemptedQuestions: Set<string>;
  /** test id -> outcome */
  testOutcomes: Map<string, TestOutcome>;
}

async function loadStudentProgress(
  studentId: string,
  fileIds: string[],
  testIds: Array<{ testId: string; passingPct: number | null }>,
  client?: TypedSupabaseClient,
): Promise<StudentProgressInputs> {
  const supabase = client || getSupabaseAdminClient();

  const [progressMap, attemptedQuestions, testOutcomes] = await Promise.all([
    fileIds.length ? getFileProgressMap(studentId, fileIds, supabase) : Promise.resolve(new Map()),
    loadAttemptedQuestionIds(studentId, supabase),
    loadTestOutcomes(studentId, testIds, supabase),
  ]);

  const reads = new Map<string, { completed_at: string | null; active_seconds: number }>();
  for (const [fileId, p] of progressMap) {
    reads.set(fileId, { completed_at: p.completed_at, active_seconds: p.active_seconds });
  }
  return { reads, attemptedQuestions, testOutcomes };
}

/** Every question this student has ever answered in the bank. One walk. */
async function loadAttemptedQuestionIds(
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<Set<string>> {
  const supabase = client || getSupabaseAdminClient();
  const out = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(QB_ATTEMPTS as any)
      .select('question_id')
      .eq('student_id', studentId)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data || []) as unknown as { question_id: string }[];
    for (const r of rows) out.add(r.question_id);
    if (rows.length < PAGE) break;
  }
  return out;
}

async function loadTestOutcomes(
  studentId: string,
  tests: Array<{ testId: string; passingPct: number | null }>,
  client?: TypedSupabaseClient,
): Promise<Map<string, TestOutcome>> {
  const out = new Map<string, TestOutcome>();
  if (tests.length === 0) return out;
  const supabase = client || getSupabaseAdminClient();

  const byTest = new Map<
    string,
    Array<{
      percentage: number | null;
      status: string | null;
      mode: string | null;
      final_percentage: number | null;
      finalised_at: string | null;
    }>
  >();
  for (const part of chunk(tests.map((t) => t.testId), IN_CHUNK)) {
    const { data, error } = await supabase
      .from(TEST_ATTEMPTS as any)
      // final_percentage/finalised_at carry the drawing marks. Without them a
      // paper mock's score would stop at its objective half forever.
      .select('test_id, percentage, status, mode, final_percentage, finalised_at')
      .eq('student_id', studentId)
      .in('test_id', part);
    if (error) throw error;
    for (const row of (data || []) as any[]) {
      const list = byTest.get(row.test_id);
      if (list) list.push(row);
      else byTest.set(row.test_id, [row]);
    }
  }

  for (const t of tests) {
    out.set(t.testId, summariseAttempts(byTest.get(t.testId) || [], t.passingPct));
  }
  return out;
}

// ============================================================================
// The student grid
// ============================================================================

/**
 * Every published paper, grouped exam then year, with this student's progress.
 *
 * Papers with neither questions nor a PDF are dropped even when published: they
 * would draw a card whose three faces are all unavailable.
 */
export async function listPapersForStudent(
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<NexusQBPaperGroup[]> {
  const supabase = client || getSupabaseAdminClient();

  const { data: paperRows, error } = await supabase
    .from(PAPERS as any)
    .select('*')
    .eq('is_student_visible', true)
    .order('year', { ascending: false });
  if (error) throw error;
  const papers = (paperRows || []) as unknown as NexusQBOriginalPaper[];
  if (papers.length === 0) return [];

  const questionIdsByPaper = await loadPaperQuestionIds(papers, supabase);

  // Placements for the whole set in one read, rather than per paper.
  const { data: placementRows } = await supabase
    .from(PLACEMENTS as any)
    .select('id, test_id, context_id, passing_pct')
    .eq('context_type', 'qb_paper')
    .eq('is_active', true)
    .eq('is_visible', true)
    .in('context_id', papers.map((p) => p.id));
  const placementByPaper = new Map<string, { id: string; test_id: string; passing_pct: number | null }>();
  for (const row of (placementRows || []) as any[]) placementByPaper.set(row.context_id, row);

  const fileIds = papers.map((p) => p.study_file_id).filter((id): id is string => !!id);
  const testList = [...placementByPaper.values()].map((p) => ({
    testId: p.test_id,
    passingPct: p.passing_pct != null ? Number(p.passing_pct) : null,
  }));
  const progress = await loadStudentProgress(studentId, fileIds, testList, supabase);

  const cards = papers
    .map((paper) => toCard(paper, questionIdsByPaper, placementByPaper, progress))
    .filter((card): card is NexusQBPaperCard => card !== null);

  return groupCards(cards);
}

function toCard(
  paper: NexusQBOriginalPaper,
  questionIdsByPaper: Map<string, string[]>,
  placementByPaper: Map<string, { id: string; test_id: string; passing_pct: number | null }>,
  progress: StudentProgressInputs,
): NexusQBPaperCard | null {
  const questionIds = questionIdsByPaper.get(paperKey(paper)) || [];
  const hasPdf = !!paper.study_file_id;
  if (questionIds.length === 0 && !hasPdf) return null;

  const attempted = questionIds.filter((id) => progress.attemptedQuestions.has(id)).length;
  const read = paper.study_file_id ? progress.reads.get(paper.study_file_id) : undefined;
  const placement = placementByPaper.get(paper.id);
  const outcome = placement ? progress.testOutcomes.get(placement.test_id) : undefined;

  const faces: QBPaperFaceStates = {
    read: faceFromCounts(hasPdf, (read?.active_seconds ?? 0) > 0, !!read?.completed_at),
    practice: faceFromCounts(
      questionIds.length > 0,
      attempted > 0,
      questionIds.length > 0 && attempted >= questionIds.length,
    ),
    test: faceFromCounts(!!placement, (outcome?.attempts ?? 0) > 0, !!outcome?.passed),
  };

  const { title, short_title } = paperTitles(paper);
  return {
    id: paper.id,
    exam_type: paper.exam_type,
    exam_label: QB_EXAM_TYPE_LABELS[paper.exam_type] || paper.exam_type,
    year: paper.year,
    session: paper.session,
    shift: paper.shift as QBShift | null,
    title,
    short_title,
    question_count: questionIds.length,
    attempted_count: attempted,
    practice_pct: questionIds.length > 0 ? Math.round((attempted / questionIds.length) * 100) : 0,
    has_pdf: hasPdf,
    has_test: !!placement,
    best_test_pct: outcome?.best_pct ?? null,
    faces,
  };
}

/**
 * Cards into exam tabs and year headings.
 *
 * NATA leads, matching the teacher's tab order and the exam tree, because it is
 * the exam most of this cohort is sitting.
 */
function groupCards(cards: NexusQBPaperCard[]): NexusQBPaperGroup[] {
  const byExam = new Map<string, NexusQBPaperCard[]>();
  for (const card of cards) {
    const list = byExam.get(card.exam_type);
    if (list) list.push(card);
    else byExam.set(card.exam_type, [card]);
  }

  const groups: NexusQBPaperGroup[] = [];
  for (const [examType, examCards] of byExam) {
    const byYear = new Map<number, NexusQBPaperCard[]>();
    for (const card of examCards) {
      const list = byYear.get(card.year);
      if (list) list.push(card);
      else byYear.set(card.year, [card]);
    }
    const years = [...byYear.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([year, papers]) => ({
        year,
        papers: papers.sort((a, b) => a.short_title.localeCompare(b.short_title)),
      }));

    groups.push({
      exam_type: examType as QBExamType,
      exam_label: QB_EXAM_TYPE_LABELS[examType as QBExamType] || examType,
      paper_count: examCards.length,
      years,
    });
  }

  return groups.sort((a, b) => {
    if (a.exam_type === 'NATA') return -1;
    if (b.exam_type === 'NATA') return 1;
    return a.exam_label.localeCompare(b.exam_label);
  });
}

// ============================================================================
// One paper, for the detail screen
// ============================================================================

/**
 * A paper with everything its detail screen needs, in one call.
 *
 * Returns null when the paper is unpublished or gone, so the route can answer
 * 404 without a second read. The study file is re-checked against the student's
 * own folder visibility rather than trusted from the link: a paper published to
 * everyone must not become a way past a folder targeted at one exam.
 */
export async function getPaperDetailForStudent(
  input: {
    paperId: string;
    studentId: string;
    studentExams: string[];
    studentProgram: string | null;
  },
  client?: TypedSupabaseClient,
): Promise<NexusQBPaperDetail | null> {
  const supabase = client || getSupabaseAdminClient();

  const paper = await getPaperById(input.paperId, supabase);
  if (!paper || !paper.is_student_visible) return null;

  const questionIdsByPaper = await loadPaperQuestionIds([paper], supabase);
  const placed = await getPlacedPaperTest(paper.id, supabase);

  const placementByPaper = new Map<string, { id: string; test_id: string; passing_pct: number | null }>();
  if (placed) {
    placementByPaper.set(paper.id, {
      id: placed.placement_id,
      test_id: placed.test_id,
      passing_pct: placed.passing_pct,
    });
  }

  const studyFile = await loadPaperStudyFile(
    { paper, studentId: input.studentId, studentExams: input.studentExams, studentProgram: input.studentProgram },
    supabase,
  );

  const progress = await loadStudentProgress(
    input.studentId,
    studyFile ? [studyFile.id] : [],
    placed ? [{ testId: placed.test_id, passingPct: placed.passing_pct }] : [],
    supabase,
  );

  const card = toCard(paper, questionIdsByPaper, placementByPaper, progress);
  if (!card) return null;

  // The link may point at a folder this student cannot see. The card said
  // has_pdf from the column; the screen must say it from what they may open.
  if (!studyFile) {
    card.has_pdf = false;
    card.faces.read = 'unavailable';
  }

  const outcome = placed ? progress.testOutcomes.get(placed.test_id) : undefined;
  const test: NexusQBPaperTest | null = placed
    ? {
        ...placed,
        attempts_used: outcome?.attempts ?? 0,
        official_attempt_done: (outcome?.attempts ?? 0) > 0,
        best_pct: outcome?.best_pct ?? null,
      }
    : null;

  return {
    ...card,
    duration_minutes: paper.duration_minutes,
    total_marks: paper.total_marks,
    study_file: studyFile,
    test,
  };
}

/**
 * The paper's PDF as a student-safe DTO, or null when they may not open it.
 *
 * Mirrors how listFavorites assembles a file: the same folder visibility rule,
 * the same effective-downloadable rule including active grants, so a paper's
 * Read view can never be more permissive than the Study Materials browser the
 * file also appears in.
 */
async function loadPaperStudyFile(
  input: {
    paper: NexusQBOriginalPaper;
    studentId: string;
    studentExams: string[];
    studentProgram: string | null;
  },
  client?: TypedSupabaseClient,
): Promise<NexusStudyFileDTO | null> {
  if (!input.paper.study_file_id) return null;
  const supabase = client || getSupabaseAdminClient();

  const file = await getFileById(input.paper.study_file_id, supabase);
  if (!file || (file as any).is_deleted) return null;

  const folder = await getFolderById((file as any).folder_id, supabase);
  if (!folder || (folder as any).is_deleted) return null;
  if (!isFolderVisibleToStudent(folder, input.studentExams, input.studentProgram)) return null;

  const [grants, progressMap] = await Promise.all([
    listActiveGrantsForStudent(input.studentId, supabase),
    getFileProgressMap(input.studentId, [(file as any).id], supabase),
  ]);
  const p = progressMap.get((file as any).id);
  const f = file as any;

  return {
    id: f.id,
    folder_id: f.folder_id,
    title: f.title,
    file_name: f.file_name,
    file_type: f.file_type,
    file_size_bytes: f.file_size_bytes,
    page_count: f.page_count,
    kind: fileKind(f.file_type),
    downloadable: effectiveDownloadable(f, folder) || grantCoversFile(grants, f),
    sort_order: f.sort_order,
    created_at: f.created_at,
    is_new: isNewFile(f.created_at),
    status: deriveFileStatus(p),
    active_seconds: p?.active_seconds ?? 0,
    recording: fileRecording(f),
  };
}

// ============================================================================
// Teacher: students down, papers across
// ============================================================================

/**
 * Who has read, practised and sat each published paper.
 *
 * Built for a classroom rather than the whole school, because the question a
 * teacher actually asks is "how is my class doing", and the matrix is drawn one
 * classroom at a time.
 *
 * Cells are sparse: a student who has touched nothing contributes no cells, so a
 * wide grid over a new cohort stays small on the wire.
 */
export async function getPaperProgressMatrix(
  classroomId: string,
  client?: TypedSupabaseClient,
): Promise<NexusQBPaperMatrix> {
  const supabase = client || getSupabaseAdminClient();

  const { data: paperRows } = await supabase
    .from(PAPERS as any)
    .select('*')
    .eq('is_student_visible', true)
    .order('year', { ascending: false });
  const papers = (paperRows || []) as unknown as NexusQBOriginalPaper[];

  const { data: enrolments } = await supabase
    .from(ENROLLMENTS as any)
    .select('user:users!nexus_enrollments_user_id_fkey!inner(id, name, avatar_url, is_alumni)')
    .eq('classroom_id', classroomId)
    .eq('role', 'student')
    .eq('is_active', true)
    .eq('users.is_alumni', false);

  const students = ((enrolments || []) as any[])
    .map((row) => row.user)
    .filter(Boolean)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

  if (papers.length === 0 || students.length === 0) {
    return { papers: [], rows: [] };
  }

  const questionIdsByPaper = await loadPaperQuestionIds(papers, supabase);

  const { data: placementRows } = await supabase
    .from(PLACEMENTS as any)
    .select('id, test_id, context_id, passing_pct')
    .eq('context_type', 'qb_paper')
    .eq('is_active', true)
    .in('context_id', papers.map((p) => p.id));
  const placementByPaper = new Map<string, { id: string; test_id: string; passing_pct: number | null }>();
  for (const row of (placementRows || []) as any[]) placementByPaper.set(row.context_id, row);

  const fileIds = papers.map((p) => p.study_file_id).filter((id): id is string => !!id);
  const testList = [...placementByPaper.values()].map((p) => ({
    testId: p.test_id,
    passingPct: p.passing_pct != null ? Number(p.passing_pct) : null,
  }));

  const visiblePapers = papers.filter(
    (p) => (questionIdsByPaper.get(paperKey(p)) || []).length > 0 || !!p.study_file_id,
  );

  const rows: NexusQBPaperMatrixRow[] = [];
  for (const student of students) {
    // Per student rather than one giant read: a class of 60 across 26 papers is
    // 60 small queries, where the single-query alternative pulls every attempt
    // row in the cohort into memory to bucket it here.
    const progress = await loadStudentProgress(student.id, fileIds, testList, supabase);
    const cells: Record<string, NexusQBPaperMatrixCell> = {};
    let completed = 0;

    for (const paper of visiblePapers) {
      const card = toCard(paper, questionIdsByPaper, placementByPaper, progress);
      if (!card) continue;
      if (isPaperComplete(card.faces)) completed += 1;
      if (!hasEngaged(card.faces)) continue;

      cells[paper.id] = {
        ...card.faces,
        best_test_pct: card.best_test_pct,
        attempted_count: card.attempted_count,
      };
    }

    rows.push({
      student_id: student.id,
      student_name: student.name || 'Unnamed student',
      avatar_url: student.avatar_url ?? null,
      cells,
      papers_completed: completed,
    });
  }

  return {
    papers: visiblePapers.map((p) => {
      const { title, short_title } = paperTitles(p);
      return {
        id: p.id,
        title,
        short_title,
        exam_type: p.exam_type,
        question_count: (questionIdsByPaper.get(paperKey(p)) || []).length,
        has_pdf: !!p.study_file_id,
        has_test: placementByPaper.has(p.id),
      };
    }),
    rows,
  };
}

// ============================================================================
// Teacher: one paper's readiness, for the Student access panel
// ============================================================================

export interface NexusQBPaperStaffView {
  paper: NexusQBOriginalPaper;
  question_count: number;
  /** Everything parsed off this paper, whether active or not. */
  parsed_question_count: number;
  study_file: { id: string; title: string; file_name: string; folder_id: string } | null;
  test: Omit<NexusQBPaperTest, 'attempts_used' | 'official_attempt_done' | 'best_pct'> | null;
  publish_blocker: string | null;
}

export async function getPaperStaffView(
  paperId: string,
  client?: TypedSupabaseClient,
): Promise<NexusQBPaperStaffView | null> {
  const supabase = client || getSupabaseAdminClient();
  const paper = await getPaperById(paperId, supabase);
  if (!paper) return null;

  const [questionIds, test, parsedCount] = await Promise.all([
    getPaperQuestionIds(paper, supabase),
    getPlacedPaperTest(paperId, supabase),
    // Everything parsed off this paper, active or not. The panel shows the two
    // side by side, because "90 questions" reads as the whole paper when the
    // paper has 92 and the 2 missing ones are its entire drawing section.
    supabase
      .from(QUESTIONS)
      .select('id', { count: 'exact', head: true })
      .eq('original_paper_id', paperId)
      .then((r) => r.count ?? 0),
  ]);

  let studyFile: NexusQBPaperStaffView['study_file'] = null;
  if (paper.study_file_id) {
    const file = (await getFileById(paper.study_file_id, supabase)) as any;
    if (file && !file.is_deleted) {
      studyFile = {
        id: file.id,
        title: file.title,
        file_name: file.file_name,
        folder_id: file.folder_id,
      };
    }
  }

  return {
    paper,
    question_count: questionIds.length,
    parsed_question_count: parsedCount,
    study_file: studyFile,
    test,
    publish_blocker: studyFile || questionIds.length > 0
      ? null
      : 'Link the original PDF or activate at least one question before publishing.',
  };
}
