/**
 * The free trial of a full tool for signed-out visitors: a few calculations
 * on this device, then sign in. A "run" is one set of inputs the visitor
 * settled on (the caller debounces), so typing digit by digit never uses one
 * up, and going back to an earlier set of inputs costs nothing.
 *
 * localStorage only, wrapped in try/catch. This is a nudge, not a lock: a
 * visitor who clears storage gets another trial, which is fine. When storage
 * is unavailable (private mode, blocked) the trial reports `available: false`
 * and the page keeps the public demo.
 */

const PREFIX = 'neram_tool_trial:';
const VERSION = 1;

/** Free calculations per tool before sign-in. */
export const GUEST_RUN_LIMITS: Partial<Record<string, number>> = {
  'nata-cutoff-calculator': 2,
};

export interface GuestRunState {
  /** False when storage cannot be used; show the demo instead of the trial. */
  available: boolean;
  limit: number;
  used: number;
  remaining: number;
  /** True when this input set is a new run and the free runs are spent. */
  locked: boolean;
}

interface Stored {
  v: number;
  runs: string[];
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStore(): Store | null {
  try {
    if (typeof window === 'undefined') return null;
    const s = window.localStorage;
    // Some browsers expose localStorage but throw on write (Safari private mode, old versions).
    const probe = `${PREFIX}probe`;
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

function read(store: Store, toolId: string): string[] {
  try {
    const raw = store.getItem(PREFIX + toolId);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Stored;
    if (parsed?.v !== VERSION || !Array.isArray(parsed.runs)) return [];
    return parsed.runs.filter((r): r is string => typeof r === 'string').slice(0, 20);
  } catch {
    return [];
  }
}

export function guestRunLimit(toolId: string): number {
  return GUEST_RUN_LIMITS[toolId] ?? 0;
}

/** Where this visitor stands, for a given input fingerprint (null while nothing is entered). */
export function guestRunState(toolId: string, fingerprint: string | null, store: Store | null = defaultStore()): GuestRunState {
  const limit = guestRunLimit(toolId);
  if (!store || limit <= 0) return { available: false, limit, used: 0, remaining: 0, locked: false };
  const runs = read(store, toolId);
  const used = Math.min(runs.length, limit);
  const known = fingerprint !== null && runs.includes(fingerprint);
  return {
    available: true,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    locked: fingerprint !== null && !known && used >= limit,
  };
}

/**
 * Count a settled set of inputs as a run. Returns the new state. A run already
 * counted, or one past the limit, changes nothing.
 */
export function recordGuestRun(toolId: string, fingerprint: string, store: Store | null = defaultStore()): GuestRunState {
  const state = guestRunState(toolId, fingerprint, store);
  if (!state.available || state.locked || !store) return state;
  const runs = read(store, toolId);
  if (runs.includes(fingerprint)) return state;
  try {
    const next: Stored = { v: VERSION, runs: [...runs, fingerprint] };
    store.setItem(PREFIX + toolId, JSON.stringify(next));
  } catch {
    return { ...state, available: false };
  }
  return guestRunState(toolId, fingerprint, store);
}
