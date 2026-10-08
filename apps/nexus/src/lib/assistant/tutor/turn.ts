/**
 * One tutor turn, end to end: refuse during an open test, find the live pack,
 * load the facts, run the engine, ask the model only if the engine asks,
 * save what the student chose to keep, write the session, mastery and events,
 * and keep a transcript in the student's tutor:<questionId> thread.
 *
 * A resend with the same clientMessageId returns the first reply instead of
 * running the turn twice (a lost response must not double a hint or a mastery update).
 */
import { ApiError, describeError } from '@/lib/api-errors';
import { appendMessage, findReplyToExternalId } from '../store';
import type { AssistantCaller } from '../types';
import { isUuid } from '../ids';
import { hasTestRunning } from '../test-lock';
import { hydrateState, step, type EngineOut, type Facts, type SessionState } from './engine';
import { interpretReply, type InterpretMeta } from './interpret';
import { tutorMatchers } from './matchers';
import type { TutorPack } from './pack';
import { buildLearningItem } from './save';
import {
  createSession, ensureTutorThread, getOpenSession, loadConcepts, loadLatestAttempt, loadLivePack,
  loadMastery, loadQuestion, loadRecentlyChecked, loadSimilar, saveLearningItem, saveSession, writeEvents, writeEvidence,
  type ConceptRef, type SessionRow,
} from './store';
import type { MasteryState, TutorAction, TutorBlock, TutorEnvelope } from './types';
import { NOT_READY, STILL_WORKING, TEST_OPEN } from './copy';

export { NOT_READY, STILL_WORKING, TEST_OPEN };

const ACTION_TYPES = new Set(['start', 'guide_me', 'try_myself', 'reader_answered', 'choose', 'answer', 'hint', 'why', 'show_solution', 'similar', 'save', 'skip_check', 'end']);

/** The action from a request body: a known type and short, typed fields only. */
export function readAction(raw: unknown): TutorAction | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== 'object' || typeof r.type !== 'string' || !ACTION_TYPES.has(r.type)) return null;
  const str = (v: unknown, max: number) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);
  switch (r.type) {
    case 'choose': {
      const stepId = str(r.stepId, 120);
      const choiceId = str(r.choiceId, 40);
      return stepId && choiceId ? { type: 'choose', stepId, choiceId } : null;
    }
    case 'answer': {
      const text = typeof r.text === 'string' ? r.text.trim().slice(0, 500) : '';
      return text ? { type: 'answer', text } : null;
    }
    case 'save': {
      const ref = str(r.ref, 80);
      return ref ? { type: 'save', ref } : null;
    }
    default:
      return { type: r.type } as TutorAction;
  }
}

/** What the student did, in words, for the transcript. */
function studentLine(a: TutorAction): string {
  switch (a.type) {
    case 'answer': return a.text;
    case 'choose': return `(chose ${a.choiceId})`;
    case 'save': return `(save ${a.ref})`;
    default: return `(${a.type})`;
  }
}

/** The tutor's words, for the transcript (the envelope holds the full reply). */
function tutorLine(blocks: TutorBlock[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.kind === 'tutor_text' || b.kind === 'verdict' || b.kind === 'hint') parts.push(b.md);
    else if (b.kind === 'check_question') parts.push(b.md);
  }
  return parts.join('\n').slice(0, 4000) || '(tutor)';
}

export interface TutorTurnInput {
  supabase: any;
  caller: AssistantCaller;
  questionId: string;
  action: TutorAction;
  clientMessageId: string;
  now?: Date;
}

export async function runTutorTurn(input: TutorTurnInput): Promise<TutorEnvelope> {
  const { supabase, caller } = input;
  const now = input.now ?? new Date();
  if (!isUuid(input.questionId)) throw new ApiError(NOT_READY, 404);

  if (await hasTestRunning(supabase, caller.id, now)) throw new ApiError(TEST_OPEN, 409);
  const question = await loadQuestion(supabase, input.questionId);
  const live = question ? await loadLivePack(supabase, question) : null;
  if (!question || !live) throw new ApiError(NOT_READY, 404);
  const pack: TutorPack = live.pack;

  const threadId = await ensureTutorThread(supabase, caller.id, question.id);
  const clientId = String(input.clientMessageId || '').slice(0, 80) || null;
  const asked = await appendMessage(supabase, { threadId, role: 'user', text: studentLine(input.action), externalId: clientId, mode: 'tutor' });
  if (!asked.inserted) {
    const prior = clientId ? await findReplyToExternalId(supabase, threadId, clientId) : { reply: null };
    if (prior.reply?.envelope) return prior.reply.envelope as unknown as TutorEnvelope;
    throw new ApiError(STILL_WORKING, 409);
  }

  let session: SessionRow | null = await getOpenSession(supabase, caller.id, question.id);
  let action = input.action;
  const fresh = !session || Object.keys(session.state || {}).length === 0;
  if (!session) session = await createSession(supabase, { studentId: caller.id, questionId: question.id, packId: live.id, threadId });
  // A session that was never started (or ended and reopened) begins with start, whatever was tapped.
  if (fresh && action.type !== 'start') action = { type: 'start' };
  const prev: SessionState | null = fresh ? null : hydrateState(session.state);

  // Facts: concepts and the student's mastery of them, prerequisite checks, the latest reader answer.
  const slugs = [...new Set([...pack.concepts.map((c) => c.slug), ...pack.prerequisites.map((p) => p.concept), ...pack.steps.map((s) => s.concept)])];
  const concepts = await loadConcepts(supabase, slugs);
  const ids = [...concepts.values()].map((c) => c.id);
  const [mastery, recent, attempt] = await Promise.all([
    loadMastery(supabase, caller.id, ids),
    loadRecentlyChecked(supabase, caller.id, ids, now),
    action.type === 'start' || action.type === 'reader_answered' ? loadLatestAttempt(supabase, caller.id, question.id) : Promise.resolve(null),
  ]);
  const bySlug = (fn: (c: ConceptRef) => boolean) => [...concepts.values()].filter(fn).map((c) => c.slug);
  const masteryBySlug: Record<string, MasteryState> = {};
  const masteryById: Record<string, MasteryState> = {};
  for (const c of concepts.values()) {
    const st = mastery.get(c.id)?.state ?? 'UNKNOWN';
    masteryBySlug[c.slug] = st;
    masteryById[c.id] = st;
  }
  const facts: Facts = {
    questionFormat: question.question_format === 'NUMERICAL' ? 'NUMERICAL' : 'MCQ',
    mastery: masteryBySlug,
    conceptLabels: Object.fromEntries([...concepts.values()].map((c) => [c.slug, c.label])),
    recentlyChecked: bySlug((c) => recent.has(c.id)),
    attempt,
  };
  if (action.type === 'similar') {
    const conceptIds = pack.concepts.map((c) => concepts.get(c.slug)?.id).filter((x): x is string => Boolean(x));
    const coreIds = pack.concepts.filter((c) => c.role === 'core').map((c) => concepts.get(c.slug)?.id).filter((x): x is string => Boolean(x));
    try {
      facts.similar = await loadSimilar(supabase, { studentId: caller.id, question, conceptIds, coreIds, masteryById });
    } catch (err) {
      console.error('[tutor similar]', describeError(err));
      facts.similar = [];
    }
  }

  let out: EngineOut = step(prev, pack, action, facts, tutorMatchers);
  let aiMeta: InterpretMeta | null = null;
  if (out.needsAi) {
    const openStep = out.needsAi.stepId ? pack.steps.find((s) => s.id === out.needsAi!.stepId) ?? null : null;
    const ai = await interpretReply({
      supabase, caller, now, purpose: out.needsAi.purpose, text: out.needsAi.text,
      questionText: question.question_text ?? '', step: openStep, hintsUsed: prev?.hintsUsed ?? 0,
      lastStudent: prev?.lastStudent ?? [], stepMastery: openStep ? masteryBySlug[openStep.concept] ?? null : null,
    });
    aiMeta = ai.meta;
    out = step(prev, pack, action, { ...facts, interpreted: ai.result }, tutorMatchers);
  }

  if (out.save && caller.impersonating) {
    out.blocks.push({ id: `b${out.blocks.length + 1}`, kind: 'tutor_text', md: 'Viewing as a student, nothing is saved to My Learning.' });
  } else if (out.save) {
    const item = buildLearningItem(pack, out.save.ref, question.question_text);
    let saved = false;
    if (item) {
      try {
        saved = await saveLearningItem(supabase, { studentId: caller.id, ref: out.save.ref, questionId: question.id, sessionId: session.id, item, concepts });
      } catch (err) {
        console.error('[tutor save]', describeError(err));
      }
    }
    out.blocks.push({ id: `b${out.blocks.length + 1}`, kind: 'tutor_text', md: saved ? 'Saved to My Learning.' : 'I could not save that just now. Try again in a moment.' });
  }

  const wrote = await saveSession(supabase, session, out.state, { aiCalls: aiMeta ? 1 : 0, now });
  if (!wrote) throw new ApiError(STILL_WORKING, 409);

  // Mastery and events are a record of learning, not the reply: a failed write is logged, never shown.
  // A teacher viewing as the student is not the student learning, so nothing is recorded for them.
  if (!caller.impersonating) {
    try {
      await writeEvidence(supabase, caller.id, out.evidence, concepts, { hard: question.difficulty === 'HARD', now });
      await writeEvents(supabase, caller.id, out.events, { questionId: question.id, sessionId: session.id, concepts });
    } catch (err) {
      console.error('[tutor evidence]', describeError(err));
    }
  }

  const total = pack.steps.length;
  const envelope: TutorEnvelope = {
    sessionId: session.id,
    phase: out.state.phase,
    blocks: out.blocks,
    chips: out.chips,
    llm: Boolean(aiMeta),
    progress: out.state.guided || out.state.phase === 'guided' ? { step: Math.min(out.state.stepIndex + 1, total), total } : null,
    hintsUsed: out.state.hintsUsed,
  };
  try {
    await appendMessage(supabase, {
      threadId, role: 'assistant', text: tutorLine(out.blocks), replyTo: asked.row?.id ?? null, mode: 'tutor',
      envelope: envelope as unknown as Record<string, unknown>, llm: Boolean(aiMeta),
      model: aiMeta?.model ?? null, promptTokens: aiMeta?.promptTokens ?? null, outputTokens: aiMeta?.outputTokens ?? null, costUsd: aiMeta?.costUsd ?? null,
    });
  } catch (err) {
    // The allowance counts these rows, so a lost one is logged loudly; the student still gets the reply.
    console.error('[tutor transcript]', describeError(err));
  }
  return envelope;
}
