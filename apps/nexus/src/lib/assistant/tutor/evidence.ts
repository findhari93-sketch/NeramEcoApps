/**
 * Mastery from ordinary practice: every answer a student checks in the
 * question bank is evidence about the concepts that question needs, whether
 * or not the tutor was open. This is the ONE place a question-level answer
 * becomes mastery evidence; the tutor engine only scores its own step checks.
 *
 *   first answer, right, no tutor help      -> independent (hard if the question is HARD)
 *   right with the tutor's hints or steps   -> by how much help (helpEvidence)
 *   right on a later try                    -> hint_light (the key was shown after the first try)
 *   wrong                                   -> wrong, with the pack's error code for that option or value
 *
 * Called by api/question-bank/questions/[id]/attempt after the attempt is
 * stored. Never throws: a failure here must not cost the student their answer.
 */
import { describeError } from '@/lib/api-errors';
import { helpEvidence, hydrateState, type Evidence, type EvidenceEvent } from './engine';
import { tutorMatchers } from './matchers';
import type { ErrorCode } from './pack';
import {
  getOpenSession, loadConcepts, loadLivePack, loadQuestion, loadQuestionConcepts, writeEvents, writeEvidence,
} from './store';

const MISSING_TABLE = new Set(['42P01', 'PGRST205', 'PGRST202']);
function isMissingTable(err: unknown): boolean {
  const code = (err as { cause?: { code?: string } })?.cause?.code;
  return Boolean(code && MISSING_TABLE.has(code));
}

export function practiceEvidence(input: {
  isCorrect: boolean;
  priorAttempts: number;
  session: { hintsUsed: number; guided: boolean; revealed: boolean } | null;
  errorCode: ErrorCode | null;
}): { evidence: Evidence; errorCode: ErrorCode | null } {
  if (!input.isCorrect) return { evidence: 'wrong', errorCode: input.errorCode };
  if (input.session) return { evidence: helpEvidence(input.session), errorCode: null };
  return { evidence: input.priorAttempts === 0 ? 'independent' : 'hint_light', errorCode: null };
}

export async function recordPracticeEvidence(
  supabase: any,
  input: { studentId: string; questionId: string; isCorrect: boolean; selected: string; now?: Date },
): Promise<void> {
  try {
    const mapped = await loadQuestionConcepts(supabase, input.questionId);
    if (!mapped.length) return;
    const core = mapped.filter((c) => c.role === 'core');
    const slugs = (core.length ? core : mapped).map((c) => c.slug).filter(Boolean);
    const now = input.now ?? new Date();

    const [question, session, prior] = await Promise.all([
      loadQuestion(supabase, input.questionId),
      getOpenSession(supabase, input.studentId, input.questionId),
      supabase.from('nexus_qb_student_attempts').select('id').eq('student_id', input.studentId).eq('question_id', input.questionId).limit(2),
    ]);
    if (!question) return;

    let errorCode: ErrorCode | null = null;
    if (!input.isCorrect) {
      const live = await loadLivePack(supabase, question);
      const hit = live?.pack.mistakes.find((m) => {
        const t = m.trigger as { option_id?: string; value?: string };
        if (t.option_id) return t.option_id.toLowerCase() === input.selected.trim().toLowerCase();
        return Boolean(t.value) && tutorMatchers.valuesMatch(input.selected, t.value!);
      });
      errorCode = hit?.code ?? null;
    }

    const state = session && Object.keys(session.state || {}).length ? hydrateState(session.state) : null;
    // The attempt just stored is one of the rows read, so "prior" is the rest.
    const priorAttempts = Math.max(0, ((prior?.data as unknown[]) || []).length - 1);
    const ev = practiceEvidence({ isCorrect: input.isCorrect, priorAttempts, session: state, errorCode });
    const concepts = await loadConcepts(supabase, slugs);
    const events: EvidenceEvent[] = [{ concepts: slugs, evidence: ev.evidence, errorCode: ev.errorCode }];
    await writeEvidence(supabase, input.studentId, events, concepts, { hard: question.difficulty === 'HARD', now });
    await writeEvents(supabase, input.studentId, [{
      kind: input.isCorrect ? 'ANSWER_CORRECT' : 'ANSWER_WRONG',
      concepts: slugs,
      errorCode: ev.errorCode,
      payload: { source: 'practice', evidence: ev.evidence, tutor: Boolean(state) },
    }], { questionId: input.questionId, sessionId: session?.id ?? null, concepts });
  } catch (err) {
    // Before the tutor migrations are applied the tables do not exist; that is not worth a log line per answer.
    if (isMissingTable(err)) return;
    console.error('[tutor practice evidence]', describeError(err));
  }
}
