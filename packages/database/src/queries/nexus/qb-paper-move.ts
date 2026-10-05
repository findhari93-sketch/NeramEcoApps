/**
 * Move questions that were filed in the wrong question bank to the right paper.
 *
 * Any selection on one paper can go to a paper of any exam (JEE Paper 2A,
 * JEE Paper 2B or NATA). 2021 Session 1 (AN) is the case that prompted it: 25
 * B.Planning questions were uploaded into the B.Arch paper under Drawing.
 *
 * The checks live here so a teacher gets a sentence they can act on before
 * anything changes. The move itself is one Postgres function,
 * nexus_qb_move_questions, so the question rows, their source rows and their
 * exam tag change together or not at all.
 *
 * A whole paper filed under the wrong exam moves with changePaperExam
 * (nexus_qb_change_paper_exam) instead: it keeps its id, so nothing on it is copied.
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type { NexusQBOriginalPaper, QBExamType, QBQuestionSection, QBShift } from '../../types';
import { QB_EXAM_TYPE_LABELS, QB_SECTION_LABELS, QB_SECTION_ORDER, isJeeExam, qbSectionsForExam } from '../../types';
import { getOrCreateOriginalPaper, refreshPaperStats } from './question-bank';
import { Paper2BError, copySharedSectionsFromPaper2A } from './qb-paper-2b';

const PAPERS = 'nexus_qb_original_papers';
const QUESTIONS = 'nexus_qb_questions';

/** See qb-paper-2b.ts: the generated types predate the section columns. */
type LooseClient = { from: (table: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any };
const loose = (client: TypedSupabaseClient): LooseClient => client as unknown as LooseClient;

/**
 * Errors a teacher can act on. Extends Paper2BError so the routes that already
 * map that class to an HTTP status handle both.
 */
export class PaperMoveError extends Paper2BError {
  constructor(message: string, status: 400 | 404 | 409) {
    super(message, status);
    this.name = 'PaperMoveError';
  }
}

/**
 * Where the questions go: a paper picked by id, or the paper of another JEE
 * exam for the same sitting, created when it does not exist yet. NATA sittings
 * never line up with JEE ones, so a NATA target is always a picked paper.
 */
export type QBMoveTarget = { paperId: string } | { examType: QBExamType };

export interface MoveQuestionsInput {
  sourcePaperId: string;
  questionIds: string[];
  target: QBMoveTarget;
  /** One section for every moved question, or null to keep each question's own. */
  section: QBQuestionSection | null;
  callerId: string;
}

export interface MoveQuestionsResult {
  paper_id: string;
  created_paper: boolean;
  moved: number;
  /** Maths and Aptitude copied in from Paper 2A, when the target is a 2B paper that lacked them. */
  copied: number;
}

async function getPaper(id: string, client: TypedSupabaseClient, what = 'Paper'): Promise<NexusQBOriginalPaper> {
  const { data, error } = await loose(client).from(PAPERS).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new PaperMoveError(`${what} not found`, 404);
  return data as NexusQBOriginalPaper;
}

/** Postgres error codes nexus_qb_move_questions raises, as HTTP statuses. */
function statusForPgCode(code: string | undefined): 400 | 404 | 409 | null {
  if (code === '22023') return 400;
  if (code === 'P0002') return 404;
  if (code === '23505') return 409;
  return null;
}

/**
 * Check a move before it runs. Returns the target exam so the caller can
 * resolve the paper only once the selection is known to be movable.
 */
async function checkMove(
  input: MoveQuestionsInput,
  source: NexusQBOriginalPaper,
  client: TypedSupabaseClient,
): Promise<{ targetExam: QBExamType; targetPaper: NexusQBOriginalPaper | null }> {
  const { target, section, questionIds } = input;

  let targetExam: QBExamType;
  let targetPaper: NexusQBOriginalPaper | null = null;
  if ('paperId' in target) {
    targetPaper = await getPaper(target.paperId, client, 'Target paper');
    if (targetPaper.id === source.id) throw new PaperMoveError('These questions are already on that paper', 400);
    targetExam = targetPaper.exam_type as QBExamType;
  } else {
    targetExam = target.examType;
    if (targetExam === source.exam_type) {
      throw new PaperMoveError(`These questions are already in ${QB_EXAM_TYPE_LABELS[targetExam]}`, 400);
    }
    if (!isJeeExam(targetExam) || !isJeeExam(source.exam_type)) {
      throw new PaperMoveError('Pick the paper to move them to', 400);
    }
  }

  const allowed = qbSectionsForExam(targetExam);
  if (section && !allowed.includes(section)) {
    throw new PaperMoveError(`${QB_EXAM_TYPE_LABELS[targetExam]} has no ${QB_SECTION_LABELS[section]} section`, 400);
  }

  const { data, error } = await loose(client)
    .from(QUESTIONS)
    .select('id, section, question_format, original_paper_id')
    .in('id', questionIds);
  if (error) throw error;
  const rows = (data || []) as Array<{
    id: string;
    section: string | null;
    question_format: string;
    original_paper_id: string | null;
  }>;
  if (rows.length !== new Set(questionIds).size || rows.some((r) => r.original_paper_id !== source.id)) {
    throw new PaperMoveError('Some of these questions are not on this paper', 400);
  }

  if (rows.some((r) => r.question_format === 'DRAWING_PROMPT' && (section ?? r.section) !== 'drawing')) {
    throw new PaperMoveError('Drawing questions can only move into a Drawing section. Untick them and try again.', 400);
  }

  if (!section) {
    const homeless = rows.filter((r) => !r.section || !(allowed as string[]).includes(r.section));
    if (homeless.length > 0) {
      const names = Array.from(new Set(homeless.map((r) => (r.section ? QB_SECTION_LABELS[r.section as QBQuestionSection] ?? r.section : 'no section'))));
      throw new PaperMoveError(
        `${homeless.length} of these ${homeless.length === 1 ? 'is' : 'are'} in ${names.join(' and ')}, which ${QB_EXAM_TYPE_LABELS[targetExam]} does not have. Pick a section.`,
        400,
      );
    }
  }

  return { targetExam, targetPaper };
}

export async function moveQuestionsToPaper(
  input: MoveQuestionsInput,
  client?: TypedSupabaseClient,
): Promise<MoveQuestionsResult> {
  const typed = client || getSupabaseAdminClient();
  const ids = Array.from(new Set(input.questionIds));
  if (ids.length === 0) throw new PaperMoveError('Pick at least one question to move', 400);

  const source = await getPaper(input.sourcePaperId, typed);
  const checked = await checkMove({ ...input, questionIds: ids }, source, typed);

  let target = checked.targetPaper;
  let createdPaper = false;
  if (!target) {
    const made = await getOrCreateOriginalPaper(
      checked.targetExam,
      source.year,
      source.session,
      input.callerId,
      (source.shift as QBShift | null) ?? null,
      typed,
    );
    target = made.paper;
    createdPaper = made.isNew;
  }

  const { error } = await loose(typed).rpc('nexus_qb_move_questions', {
    p_source_paper_id: source.id,
    p_question_ids: ids,
    p_target_paper_id: target.id,
    p_section: input.section,
    p_section_order: input.section ? QB_SECTION_ORDER[input.section] : null,
  });
  if (error) {
    const status = statusForPgCode((error as { code?: string }).code);
    if (status) throw new PaperMoveError((error as { message?: string }).message || 'Could not move the questions', status);
    throw error;
  }

  let copied = 0;
  if (target.exam_type === 'JEE_PAPER_2B') {
    try {
      copied = (await copySharedSectionsFromPaper2A(target.id, input.callerId, typed)).copied;
    } catch (err) {
      // The move itself succeeded. A 2A paper with nothing to copy yet is not
      // a reason to report failure; the 2B page offers the copy again.
      if (!(err instanceof Paper2BError)) throw err;
    }
  }

  await refreshPaperStats(source.id, typed);
  await refreshPaperStats(target.id, typed);

  return { paper_id: target.id, created_paper: createdPaper, moved: ids.length, copied };
}

/** A section the new exam lacks, mapped to one it has. */
export type QBSectionMap = Partial<Record<QBQuestionSection, QBQuestionSection>>;

export interface ChangePaperExamInput {
  paperId: string;
  examType: QBExamType;
  year: number;
  session: string | null;
  shift: QBShift | null;
  sectionMap: QBSectionMap;
}

export interface ChangePaperExamResult {
  paper: NexusQBOriginalPaper;
  /** Questions renumbered into a section the new exam has. */
  remapped: number;
  /** Drawing prompts kept under the old name, on a paper of their own. */
  left_behind: number;
  left_paper_id: string | null;
}

/**
 * Move a whole paper to another question bank, renaming it in the same step.
 *
 * The paper keeps its id, so its questions and everything on them (attempts,
 * reports, answers, solutions, videos) go with it. Sections the new exam does
 * not have must each be mapped to one it does; drawing prompts that would lose
 * their Drawing section stay behind on a paper with the old name.
 */
export async function changePaperExam(
  input: ChangePaperExamInput,
  client?: TypedSupabaseClient,
): Promise<ChangePaperExamResult> {
  const typed = client || getSupabaseAdminClient();
  const paper = await getPaper(input.paperId, typed);
  const label = QB_EXAM_TYPE_LABELS[input.examType];
  if (paper.exam_type === input.examType) {
    throw new PaperMoveError(`This paper is already in ${label}`, 400);
  }

  const allowed = qbSectionsForExam(input.examType) as string[];
  for (const [from, to] of Object.entries(input.sectionMap)) {
    if (!to || !allowed.includes(to)) {
      throw new PaperMoveError(
        `${label} has no ${QB_SECTION_LABELS[to as QBQuestionSection] ?? to} section. Pick another for ${QB_SECTION_LABELS[from as QBQuestionSection] ?? from}.`,
        400,
      );
    }
  }

  const { data, error: readError } = await loose(typed)
    .from(QUESTIONS)
    .select('section, question_format')
    .eq('original_paper_id', paper.id);
  if (readError) throw readError;
  const rows = (data || []) as Array<{ section: string | null; question_format: string }>;
  const stays = (r: { question_format: string }) => !(r.question_format === 'DRAWING_PROMPT' && input.examType === 'JEE_PAPER_2B');
  const unmapped = Array.from(
    new Set(
      rows
        .filter((r) => stays(r) && r.section && !allowed.includes(r.section) && !input.sectionMap[r.section as QBQuestionSection])
        .map((r) => r.section as string),
    ),
  );
  if (unmapped.length > 0) {
    const names = unmapped.map((s) => QB_SECTION_LABELS[s as QBQuestionSection] ?? s).join(' and ');
    throw new PaperMoveError(`${label} has no ${names} section. Pick where those questions go.`, 400);
  }

  const { data: result, error } = await loose(typed).rpc('nexus_qb_change_paper_exam', {
    p_paper_id: paper.id,
    p_exam_type: input.examType,
    p_year: input.year,
    p_session: input.session,
    p_shift: input.shift,
    p_section_map: input.sectionMap,
  });
  if (error) {
    const status = statusForPgCode((error as { code?: string }).code);
    if (status === 409) {
      throw new PaperMoveError(
        `${label} already has a paper for this year, session and shift. Open that paper instead, or pick a different one.`,
        409,
      );
    }
    if (status) throw new PaperMoveError((error as { message?: string }).message || 'Could not move the paper', status);
    throw error;
  }

  const out = (result || {}) as { remapped?: number; left_behind?: number; left_paper_id?: string | null };
  await refreshPaperStats(paper.id, typed);
  if (out.left_paper_id) await refreshPaperStats(out.left_paper_id, typed);

  return {
    paper: await getPaper(paper.id, typed),
    remapped: out.remapped ?? 0,
    left_behind: out.left_behind ?? 0,
    left_paper_id: out.left_paper_id ?? null,
  };
}

export type MoveTo2BResult = MoveQuestionsResult;

/**
 * Planning questions uploaded into a Paper 2A paper go to the Paper 2B paper of
 * the same sitting, into its Planning section. Kept for the original route.
 */
export async function moveQuestionsToPaper2B(
  sourcePaperId: string,
  questionIds: string[],
  callerId: string,
  client?: TypedSupabaseClient,
): Promise<MoveTo2BResult> {
  return moveQuestionsToPaper(
    { sourcePaperId, questionIds, target: { examType: 'JEE_PAPER_2B' }, section: 'planning', callerId },
    client,
  );
}
