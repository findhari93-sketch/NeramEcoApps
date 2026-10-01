/**
 * The ask for a question bank question, worked out on the server: the answer
 * buttons and the bank's key come from the bank row, never from the browser,
 * so a presenter screen cannot be made to grade against a key it sent.
 */

import { PadRefusal } from '@/lib/pad/rpc';
import { padDb } from '@/lib/pad/sessions';
import { answerPlan, askSpec, type AskSpec, type PadAnswerType, type QBAnswerSource } from './answer-plan';

export async function loadBankAnswer(qbQuestionId: string): Promise<QBAnswerSource | null> {
  const { data, error } = await padDb()
    .from('nexus_qb_questions')
    .select('question_format, options, correct_answer')
    .eq('id', qbQuestionId)
    .maybeSingle();
  if (error) throw error;
  return (data as QBAnswerSource | null) ?? null;
}

/**
 * pad_ask's answer type, option count and suggested key for a bank question,
 * or the teacher's own choice of buttons (chosen) with the bank's key kept
 * where it still fits. A drawing question asked with no choice is refused:
 * the presenter only shows it.
 */
export async function bankAskSpec(
  qbQuestionId: string,
  chosen: { answerType: PadAnswerType; optionCount: number | null } | null,
): Promise<AskSpec> {
  const row = await loadBankAnswer(qbQuestionId);
  if (!row) throw new PadRefusal('INVALID_INPUT', { field: 'qbQuestionId' });
  const spec = askSpec(answerPlan(row), chosen);
  if (!spec) throw new PadRefusal('INVALID_INPUT', { field: 'qbQuestionId', reason: 'show_only' });
  return spec;
}
