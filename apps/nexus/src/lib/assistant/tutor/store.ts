/**
 * Service-role reads and writes for the AI Tutor. Thin on purpose: the
 * route (api/assistant/tutor/turn) decides who may do what, the engine
 * decides what happens. `supabase` is the untyped admin client (the tutor
 * tables are not in database.generated.ts).
 */
import { createHash } from 'node:crypto';
import { describeError } from '@/lib/api-errors';
import { createThread, findThreadByExternalId } from '../store';
import type { EvidenceEvent, LearningEvent, SessionState } from './engine';
import { applyEvidence, EMPTY_MASTERY, type MasteryRow } from './mastery';
import { checksumSource, type PackQuestion, type TutorPack } from './pack';
import { pickSimilar, type Candidate } from './similar';
import type { BuiltItem } from './save';
import type { MasteryState, Phase, SimilarItem } from './types';

const QUESTIONS = 'nexus_qb_questions';
const PACKS = 'nexus_qb_tutor_packs';
const SESSIONS = 'nexus_tutor_sessions';
const CONCEPTS = 'nexus_concepts';
const QCONCEPTS = 'nexus_qb_question_concepts';
const MASTERY = 'nexus_student_concept_mastery';
const EVENTS = 'nexus_learning_events';
const ITEMS = 'nexus_learning_items';

/** The maths sections the tutor teaches in this round. */
export const TUTOR_SECTIONS: ReadonlySet<string> = new Set(['math_mcq', 'math_numerical']);
const RECHECK_DAYS = 14;

function throwIf(error: unknown): void {
  if (error) throw Object.assign(new Error(`Tutor store: ${describeError(error)}`), { cause: error });
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export interface TutorQuestion extends PackQuestion {
  id: string;
  difficulty: string | null;
  section: string | null;
  repeat_group_id: string | null;
}

export async function loadQuestion(supabase: any, id: string): Promise<TutorQuestion | null> {
  const { data, error } = await supabase
    .from(QUESTIONS)
    .select('id, question_text, question_image_url, question_format, options, correct_answer, answer_tolerance, difficulty, section, repeat_group_id, is_active, status')
    .eq('id', id)
    .maybeSingle();
  throwIf(error);
  if (!data || data.is_active === false || data.status !== 'active') return null;
  return data as TutorQuestion;
}

/** The pack a student may be taught from: live status AND written for the question as it is now. */
export async function loadLivePack(supabase: any, q: TutorQuestion): Promise<{ id: string; pack: TutorPack } | null> {
  if (!TUTOR_SECTIONS.has(q.section ?? '')) return null;
  const { data, error } = await supabase
    .from(PACKS)
    .select('id, pack, source_checksum')
    .eq('question_id', q.id)
    .in('status', ['verified', 'reviewed'])
    .maybeSingle();
  throwIf(error);
  if (!data) return null;
  // An edited question or key retires its pack without anyone touching the pack.
  if (data.source_checksum !== sha256(checksumSource(q))) return null;
  return { id: data.id, pack: data.pack as TutorPack };
}

/**
 * Whether "Learn with tutor" may show on this question (a live pack written
 * for the question as it is now). Never throws: a failure hides the button.
 */
export async function tutorAvailableFor(supabase: any, q: TutorQuestion): Promise<boolean> {
  try {
    return Boolean(await loadLivePack(supabase, q));
  } catch (err) {
    console.error('[tutor available]', describeError(err));
    return false;
  }
}

/** Which of these questions have a live pack (status only; the checksum is checked on open). */
export async function questionsWithPack(supabase: any, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const { data, error } = await supabase.from(PACKS).select('question_id').in('question_id', ids.slice(0, 100)).in('status', ['verified', 'reviewed']);
  throwIf(error);
  return new Set(((data || []) as Array<{ question_id: string }>).map((r) => r.question_id));
}

export interface ConceptRef { id: string; slug: string; label: string; chapter_tag_id: string | null }

export async function loadConcepts(supabase: any, slugs: string[]): Promise<Map<string, ConceptRef>> {
  const out = new Map<string, ConceptRef>();
  if (!slugs.length) return out;
  const { data, error } = await supabase.from(CONCEPTS).select('id, slug, label, chapter_tag_id').in('slug', [...new Set(slugs)]);
  throwIf(error);
  for (const c of (data || []) as ConceptRef[]) out.set(c.slug, c);
  return out;
}

export async function loadMastery(supabase: any, studentId: string, conceptIds: string[]): Promise<Map<string, MasteryRow>> {
  const out = new Map<string, MasteryRow>();
  if (!conceptIds.length) return out;
  const { data, error } = await supabase
    .from(MASTERY)
    .select('concept_id, state, score, evidence_n, independent_n, hard_independent_n, last_result, last_error_code')
    .eq('student_id', studentId)
    .in('concept_id', [...new Set(conceptIds)]);
  throwIf(error);
  for (const r of (data || []) as Array<MasteryRow & { concept_id: string }>) {
    const { concept_id, ...row } = r;
    out.set(concept_id, { ...row, score: Number(row.score) || 0 });
  }
  return out;
}

/** Prerequisite concepts this student was checked on in the last 14 days, by id. */
export async function loadRecentlyChecked(supabase: any, studentId: string, conceptIds: string[], now: Date): Promise<Set<string>> {
  if (!conceptIds.length) return new Set();
  const since = new Date(now.getTime() - RECHECK_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from(EVENTS)
    .select('concept_ids')
    .eq('student_id', studentId)
    .eq('kind', 'PREREQUISITE_CHECKED')
    .gte('created_at', since)
    .limit(200);
  throwIf(error);
  const want = new Set(conceptIds);
  const out = new Set<string>();
  for (const r of (data || []) as Array<{ concept_ids: string[] }>) for (const id of r.concept_ids || []) if (want.has(id)) out.add(id);
  return out;
}

/** The student's newest answer to this question in the reader. */
export async function loadLatestAttempt(supabase: any, studentId: string, questionId: string): Promise<{ isCorrect: boolean; selected: string } | null> {
  const { data, error } = await supabase
    .from('nexus_qb_student_attempts')
    .select('is_correct, selected_answer, created_at')
    .eq('student_id', studentId)
    .eq('question_id', questionId)
    .order('created_at', { ascending: false })
    .limit(1);
  throwIf(error);
  const row = (data || [])[0];
  return row ? { isCorrect: Boolean(row.is_correct), selected: String(row.selected_answer ?? '') } : null;
}

/** D3: nothing about a question opens while one of the student's tests is in progress. Fails closed. */
export async function hasTestInProgress(supabase: any, studentId: string): Promise<boolean> {
  const { data, error } = await supabase.from('nexus_test_attempts').select('id').eq('student_id', studentId).eq('status', 'in_progress').limit(1);
  if (error) return true;
  return (data || []).length > 0;
}

// ── sessions ─────────────────────────────────────────────────────────────────

export interface SessionRow {
  id: string;
  student_id: string;
  question_id: string;
  pack_id: string | null;
  thread_id: string | null;
  phase: Phase;
  hints_used: number;
  ai_calls: number;
  state: Record<string, unknown>;
  seq: number;
  attempted_at: string | null;
  revealed_at: string | null;
}

const SESSION_COLS = 'id, student_id, question_id, pack_id, thread_id, phase, hints_used, ai_calls, state, seq, attempted_at, revealed_at';

export async function getOpenSession(supabase: any, studentId: string, questionId: string): Promise<SessionRow | null> {
  const { data, error } = await supabase.from(SESSIONS).select(SESSION_COLS).eq('student_id', studentId).eq('question_id', questionId).is('ended_at', null).maybeSingle();
  throwIf(error);
  return (data as SessionRow) ?? null;
}

/** One open session per student and question; a parallel create loses the race and reads the winner. */
export async function createSession(supabase: any, input: { studentId: string; questionId: string; packId: string; threadId: string | null }): Promise<SessionRow> {
  const { data, error } = await supabase
    .from(SESSIONS)
    .insert({ student_id: input.studentId, question_id: input.questionId, pack_id: input.packId, thread_id: input.threadId, phase: 'attempt', state: {}, seq: 0 })
    .select(SESSION_COLS)
    .single();
  if (error && (error as { code?: string }).code === '23505') {
    const existing = await getOpenSession(supabase, input.studentId, input.questionId);
    if (existing) return existing;
  }
  throwIf(error);
  return data as SessionRow;
}

/** Writes only if nobody else wrote since `seq` was read. False means a parallel turn won. */
export async function saveSession(
  supabase: any,
  row: SessionRow,
  s: SessionState,
  extra: { aiCalls?: number; now: Date },
): Promise<boolean> {
  const nowIso = extra.now.toISOString();
  const patch: Record<string, unknown> = {
    phase: s.phase,
    step_index: s.stepIndex,
    hints_used: Math.min(4, s.hintsUsed),
    ai_calls: row.ai_calls + (extra.aiCalls ?? 0),
    reveal_reason: s.revealReason,
    outcome: s.outcome,
    state: s,
    seq: row.seq + 1,
    updated_at: nowIso,
  };
  if (s.attempted && !row.attempted_at) patch.attempted_at = nowIso;
  if (s.revealed && !row.revealed_at) patch.revealed_at = nowIso;
  if (s.phase === 'done') patch.ended_at = nowIso;
  const { data, error } = await supabase.from(SESSIONS).update(patch).eq('id', row.id).eq('seq', row.seq).select('id');
  throwIf(error);
  return (data || []).length === 1;
}

/** The transcript thread: one per student and question, hidden from the chat sheet. */
export async function ensureTutorThread(supabase: any, studentId: string, questionId: string): Promise<string> {
  const externalId = `tutor:${questionId}`;
  const found = await findThreadByExternalId(supabase, studentId, 'nexus', externalId);
  if (found) return found.id;
  try {
    return (await createThread(supabase, { userId: studentId, channel: 'nexus', externalId, pageContext: { path: '/student/question-bank/questions', questionId } })).id;
  } catch (err) {
    const again = await findThreadByExternalId(supabase, studentId, 'nexus', externalId);
    if (again) return again.id;
    throw err;
  }
}

export const isTutorThread = (externalId: string | null | undefined) => Boolean(externalId && externalId.startsWith('tutor:'));

// ── evidence, events, items ──────────────────────────────────────────────────

/** Folds the engine's evidence into concept mastery. Evidence for an unknown slug is skipped. */
export async function writeEvidence(
  supabase: any,
  studentId: string,
  evidence: EvidenceEvent[],
  concepts: Map<string, ConceptRef>,
  opts: { hard: boolean; now: Date },
): Promise<void> {
  const pairs = evidence.flatMap((e) => e.concepts.map((slug) => ({ id: concepts.get(slug)?.id, e }))).filter((p): p is { id: string; e: EvidenceEvent } => Boolean(p.id));
  if (!pairs.length) return;
  const current = await loadMastery(supabase, studentId, pairs.map((p) => p.id));
  const next = new Map<string, MasteryRow>();
  for (const { id, e } of pairs) {
    const prev = next.get(id) ?? current.get(id) ?? EMPTY_MASTERY;
    next.set(id, applyEvidence(prev, { evidence: e.evidence, errorCode: e.errorCode, hard: opts.hard && e.evidence === 'independent' }));
  }
  const nowIso = opts.now.toISOString();
  const rows = [...next].map(([concept_id, r]) => ({ student_id: studentId, concept_id, ...r, last_evidence_at: nowIso, updated_at: nowIso }));
  const { error } = await supabase.from(MASTERY).upsert(rows, { onConflict: 'student_id,concept_id' });
  throwIf(error);
}

export async function writeEvents(
  supabase: any,
  studentId: string,
  events: LearningEvent[],
  ctx: { questionId: string | null; sessionId: string | null; concepts: Map<string, ConceptRef> },
): Promise<void> {
  if (!events.length) return;
  const rows = events.map((e) => ({
    student_id: studentId,
    kind: e.kind,
    question_id: ctx.questionId,
    session_id: ctx.sessionId,
    concept_ids: e.concepts.map((s) => ctx.concepts.get(s)?.id).filter(Boolean),
    error_code: e.errorCode ?? null,
    payload: e.payload ?? null,
  }));
  const { error } = await supabase.from(EVENTS).insert(rows);
  throwIf(error);
}

/** Saves an item; saving the same thing twice is one item. Returns whether it is saved. */
export async function saveLearningItem(
  supabase: any,
  input: { studentId: string; ref: string; questionId: string; sessionId: string; item: BuiltItem; concepts: Map<string, ConceptRef> },
): Promise<boolean> {
  const conceptIds = input.item.conceptSlugs.map((s) => input.concepts.get(s)?.id).filter(Boolean);
  const chapter = input.item.conceptSlugs.map((s) => input.concepts.get(s)?.chapter_tag_id).find(Boolean) ?? null;
  const { error } = await supabase.from(ITEMS).insert({
    student_id: input.studentId,
    kind: input.item.kind,
    title: input.item.title,
    body_md: input.item.body_md,
    source_ref: input.ref,
    source_question_id: input.questionId,
    source_session_id: input.sessionId,
    concept_ids: conceptIds,
    chapter_tag_id: chapter,
  });
  if (error && (error as { code?: string }).code === '23505') return true;
  throwIf(error);
  return true;
}

/** One question per similarity level, with a public preview (question text only). */
export async function loadSimilar(
  supabase: any,
  input: { studentId: string; question: TutorQuestion; conceptIds: string[]; coreIds: string[]; masteryById: Record<string, MasteryState> },
): Promise<SimilarItem[]> {
  const { data, error } = await supabase.rpc('nexus_tutor_similar_candidates', { p_student: input.studentId, p_question: input.question.id, p_limit: 40 });
  throwIf(error);
  const picked = pickSimilar(
    { conceptIds: input.conceptIds, coreIds: input.coreIds, difficulty: input.question.difficulty },
    (data || []) as Candidate[],
    input.masteryById,
  );
  if (!picked.length) return [];
  const { data: qs, error: qErr } = await supabase.from(QUESTIONS).select('id, question_text, difficulty').in('id', picked.map((p) => p.questionId));
  throwIf(qErr);
  const byId = new Map(((qs || []) as Array<{ id: string; question_text: string | null; difficulty: string | null }>).map((q) => [q.id, q]));
  return picked
    .filter((p) => byId.has(p.questionId))
    .map((p) => {
      const q = byId.get(p.questionId)!;
      return { questionId: p.questionId, level: p.level, preview: previewOf(q.question_text), difficulty: q.difficulty, hasTutor: p.hasPack };
    });
}

/** The first ~160 characters of a question, not cutting a $...$ in half. */
export function previewOf(text: string | null): string {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= 160) return t;
  let cut = t.slice(0, 160);
  if (((cut.match(/(?<!\\)\$/g) || []).length) % 2 === 1) cut = cut.slice(0, cut.lastIndexOf('$'));
  return `${cut.trimEnd()}…`;
}

/** Concept ids for a question from the mapping table (used by practice evidence). */
export async function loadQuestionConcepts(supabase: any, questionId: string): Promise<Array<{ concept_id: string; role: 'core' | 'uses'; slug: string }>> {
  const { data, error } = await supabase.from(QCONCEPTS).select('concept_id, role, nexus_concepts(slug)').eq('question_id', questionId);
  throwIf(error);
  return ((data || []) as Array<{ concept_id: string; role: 'core' | 'uses'; nexus_concepts: { slug: string } | null }>).map((r) => ({
    concept_id: r.concept_id, role: r.role, slug: r.nexus_concepts?.slug ?? '',
  }));
}
