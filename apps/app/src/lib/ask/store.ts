/**
 * Server-side reads and writes for Ask aiArchitek, all best effort: the chat
 * must still answer if a write fails or the ask_* tables are missing on an
 * environment, so every call here catches and logs instead of throwing. The
 * guest allowance fails open for the same reason (a database blip should not
 * lock a student out), like Aintra's guest gate.
 */
import {
  appendAskMessage,
  countAskGuestAnswersSince,
  createAskThread,
  getAskMemory,
  getAskThread,
  getUserScoreCalculations,
  saveAskMemory,
  type AskOwner,
} from '@neram/database';
import { sanitizeFacts, type AskFacts } from './memory';
import { istDayStartIso } from './quota';
import type { AskVisitor } from './visitor';

const log = (what: string, err: unknown) => console.error(`[ask] ${what}:`, err instanceof Error ? err.message : err);

export function ownerOf(v: AskVisitor): AskOwner {
  return v.userId ? { userId: v.userId } : { anonId: v.anonId };
}

/**
 * Remembered details. A signed-in student with nothing remembered yet starts
 * from their last saved calculator run, so someone who used the calculator is
 * already known to the chat.
 */
export async function loadFacts(v: AskVisitor): Promise<AskFacts> {
  try {
    const facts = sanitizeFacts(await getAskMemory(ownerOf(v)));
    if (Object.keys(facts).length > 0 || !v.userId) return facts;
    const { calculations } = await getUserScoreCalculations(v.userId, { toolName: 'cutoff_calculator', limit: 1 });
    const last = calculations[0] as { input_data?: Record<string, unknown>; result_data?: Record<string, unknown> } | undefined;
    if (!last) return facts;
    const input = last.input_data ?? {};
    const result = last.result_data ?? {};
    const attempts = Array.isArray(input.attempts) ? (input.attempts as Array<{ partA?: number; partB?: number }>) : [];
    return sanitizeFacts({
      board: input.board,
      boardMax: input.maxMarks,
      boardMarks: input.marksSecured,
      nataScores: attempts.map((a) => (a.partA ?? 0) + (a.partB ?? 0)).filter((s) => s > 0),
      cutoff: result.finalCutoff,
    });
  } catch (err) {
    log('load memory', err);
    return {};
  }
}

export async function saveFacts(v: AskVisitor, facts: AskFacts): Promise<void> {
  try {
    await saveAskMemory(ownerOf(v), facts as Record<string, unknown>);
  } catch (err) {
    log('save memory', err);
  }
}

/** Answers this guest has had today (India time). 0 on any error. */
export async function guestAnswersToday(anonId: string): Promise<number> {
  try {
    return await countAskGuestAnswersSince(anonId, istDayStartIso());
  } catch (err) {
    log('guest count', err);
    return 0;
  }
}

/** The thread to write to: the given one if it is theirs, else a new one. Null when storage fails. */
export async function threadFor(
  v: AskVisitor,
  threadId: string | null,
  firstMessage: string,
  pageContext: Record<string, unknown> | null
): Promise<string | null> {
  try {
    if (threadId && /^[0-9a-f-]{36}$/i.test(threadId)) {
      const existing = await getAskThread(threadId, ownerOf(v));
      if (existing) return existing.id;
    }
    const created = await createAskThread({ ...ownerOf(v), title: firstMessage.slice(0, 80), pageContext });
    return created.id;
  } catch (err) {
    log('thread', err);
    return null;
  }
}

export async function logMessage(v: AskVisitor, input: Omit<Parameters<typeof appendAskMessage>[0], 'userId' | 'anonId'>): Promise<void> {
  try {
    await appendAskMessage({ ...input, userId: v.userId, anonId: v.userId ? null : v.anonId });
  } catch (err) {
    log('message', err);
  }
}
