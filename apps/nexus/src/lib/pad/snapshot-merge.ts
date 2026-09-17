/**
 * Which of two snapshots a screen should show.
 *
 * Snapshots are fetched from several triggers at once (a Realtime hint, a
 * safety poll, the tab regaining focus, a tap's own response), so a slow
 * response can arrive after a newer one. Rendering the late arrival would flash
 * an old state: an OPEN prompt back after CLOSE, a counter going down. The rule
 * is "newer wins", ordered by what can only move forward:
 *
 *   1. an ended session (ending is final),
 *   2. the prompt sequence (Q2 comes after Q1),
 *   3. the prompt version (every visible change to a prompt bumps it),
 *   4. the database clock at read time (answer counts and presence move without
 *      a version bump; server_time is Postgres now(), one clock for everyone).
 *
 * A snapshot of a different session always replaces the current one: the
 * teacher replaced the session, and the old one is no longer the question.
 */

export interface OrderedSnapshot {
  server_time: string;
  session: { id: string; status: 'live' | 'ended' };
  prompt: { sequence: number; version: number } | null;
}

function order(snapshot: OrderedSnapshot): [number, number, number, number] {
  const time = Date.parse(snapshot.server_time);
  return [
    snapshot.session.status === 'ended' ? 1 : 0,
    snapshot.prompt?.sequence ?? 0,
    snapshot.prompt?.version ?? 0,
    Number.isFinite(time) ? time : 0,
  ];
}

/** True when `incoming` should replace `current` on screen. Ties replace, which is harmless. */
export function isNewerSnapshot(incoming: OrderedSnapshot, current: OrderedSnapshot | null | undefined): boolean {
  if (!current) return true;
  if (incoming.session.id !== current.session.id) return true;

  const a = order(incoming);
  const b = order(current);
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true;
}

/** The snapshot to keep. */
export function mergeSnapshot<T extends OrderedSnapshot>(current: T | null | undefined, incoming: T): T {
  return isNewerSnapshot(incoming, current) ? incoming : (current as T);
}
