/**
 * Keeps pad_round_results, the stored record of each student's result per
 * round, in step with the round. Called after the round ends, after publishing,
 * and after a late answer key or accepted reason on an ended round, so the
 * class's attendance and insights always read the current numbers.
 *
 * Best effort by design: the teacher's action has already succeeded, and a
 * failed store is redone by the next of those calls, so this logs and never
 * throws.
 */

import { loadPromptSessionId, loadSessionMeta, padDb, rosterIds } from './sessions';

export async function storeRoundResults(sessionId: string, actorId: string): Promise<void> {
  try {
    const meta = await loadSessionMeta(sessionId);
    if (!meta) return;
    const roster = await rosterIds(meta.classroom_id, meta.batch_id);
    const { data, error } = await padDb().rpc('pad_store_round_results', {
      p_actor: actorId,
      p_session: sessionId,
      p_roster: roster,
    });
    if (error) throw error;
    // A live round is not stored yet; that refusal is expected, not a failure.
    if (data && data.ok === false && data.code !== 'INVALID_TRANSITION') {
      console.warn('[pad] store round results refused', sessionId, data.code);
    }
  } catch (err) {
    console.error('[pad] store round results failed', sessionId, err);
  }
}

/**
 * After a change to one question (a late key, an accepted reason): stores the
 * round again only if it has already ended. While a round runs nothing is stored yet,
 * so most key changes cost no extra call. The cached status can lag a few
 * seconds behind End round; publishing stores again, so nothing is lost.
 */
export async function storeRoundResultsForPrompt(promptId: string, actorId: string): Promise<void> {
  try {
    const sessionId = await loadPromptSessionId(promptId);
    if (!sessionId) return;
    const meta = await loadSessionMeta(sessionId);
    if (meta?.status !== 'ended') return;
    await storeRoundResults(sessionId, actorId);
  } catch (err) {
    console.error('[pad] store round results failed for prompt', promptId, err);
  }
}
