/**
 * Save and next: which drawing opens after a teacher presses Redo or Complete.
 *
 * Oldest first, because the student who has waited longest for feedback is the
 * one it helps most. `remaining` counts everything still waiting once the
 * reviewed drawing is out of the way, including the one about to open.
 */
export interface PendingCandidate {
  id: string;
  submitted_at: string;
}

export function pickNextPending(
  candidates: PendingCandidate[],
  currentId: string,
): { nextId: string | null; remaining: number } {
  const waiting = candidates
    .filter((c) => c.id && c.id !== currentId)
    .sort((a, b) => Date.parse(a.submitted_at) - Date.parse(b.submitted_at));
  return { nextId: waiting[0]?.id ?? null, remaining: waiting.length };
}
