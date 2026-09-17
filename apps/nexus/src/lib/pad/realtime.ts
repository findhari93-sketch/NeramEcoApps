/**
 * Realtime hints for the Answer Pad.
 *
 * A hint tells a screen "something changed, fetch your snapshot". It never
 * carries state, names or answers: the payload is a timestamp, so a hint seen
 * by the wrong viewer reveals only that something happened. Hints go out on
 * random public topics (two UUIDs each, handed only to the session teacher and
 * to enrolled students inside their snapshots) through Supabase's REST
 * broadcast endpoint, using the service role key, which never leaves the server.
 *
 * Best effort by design. A failed, slow or throttled hint is logged and
 * dropped: every screen also refetches on focus, on reconnect and on a safety
 * poll, so a lost hint delays a screen by seconds and never loses state.
 */

/** A hint is not worth holding up a teacher's ASK for longer than this. */
const BROADCAST_TIMEOUT_MS = 1_500;
const MAX_TRACKED_TOPICS = 500;

/** When this server instance last hinted each topic, for throttling bursts of submits. */
const lastSentAt = new Map<string, number>();

/** Test seam. */
export function __resetHintThrottle(): void {
  lastSentAt.clear();
}

export interface HintOptions {
  /** Skip topics this instance hinted within this many milliseconds. */
  throttleMs?: number;
  /** Test seam for the clock. */
  now?: number;
}

function remember(topic: string, at: number): void {
  lastSentAt.delete(topic);
  lastSentAt.set(topic, at);
  while (lastSentAt.size > MAX_TRACKED_TOPICS) {
    const oldest = lastSentAt.keys().next();
    if (oldest.done) break;
    lastSentAt.delete(oldest.value);
  }
}

/** Resolves true when Supabase accepted the hint; never throws. */
export async function broadcastHint(topics: readonly string[], options: HintOptions = {}): Promise<boolean> {
  const now = options.now ?? Date.now();
  const due = [...new Set(topics.filter((topic) => typeof topic === 'string' && topic.length > 0))].filter((topic) => {
    if (!options.throttleMs) return true;
    const last = lastSentAt.get(topic);
    return last === undefined || now - last >= options.throttleMs;
  });
  if (!due.length) return false;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;

  // Marked before sending, so concurrent submits on one instance send one hint.
  for (const topic of due) remember(topic, now);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BROADCAST_TIMEOUT_MS);
  try {
    const response = await fetch(`${url.replace(/\/+$/, '')}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: due.map((topic) => ({ topic, event: 'hint', payload: { v: now } })) }),
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) {
      console.error(`[pad] realtime hint refused: ${response.status}`);
      return false;
    }
    return true;
  } catch (err) {
    // The name only: a message could echo the request, and the request carries the key.
    console.error(`[pad] realtime hint failed: ${err instanceof Error ? err.name : 'unknown error'}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}
