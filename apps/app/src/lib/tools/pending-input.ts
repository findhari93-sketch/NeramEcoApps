/**
 * What a signed-out visitor typed into a tool demo, kept while they sign in so
 * the full tool opens with the same inputs. sessionStorage only (this tab),
 * one key per tool, dropped after 30 minutes or once read.
 */
const PREFIX = 'neram_tool_pending:';
const VERSION = 1;
export const PENDING_INPUT_TTL_MS = 30 * 60 * 1000;

interface Stored<T> {
  v: number;
  ts: number;
  input: T;
}

type Primitive = string | number | boolean | null;
/** Demo inputs are flat: strings, numbers, booleans, or short lists of them. */
export type PendingInput = Record<string, Primitive | Primitive[]>;

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function savePendingInput(toolId: string, input: PendingInput, now = Date.now()): void {
  const s = storage();
  if (!s) return;
  try {
    const value: Stored<PendingInput> = { v: VERSION, ts: now, input };
    s.setItem(PREFIX + toolId, JSON.stringify(value));
  } catch {
    // Quota or privacy mode: the full tool simply opens empty.
  }
}

function isPendingInput(value: unknown): value is PendingInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const ok = (x: unknown) => x === null || ['string', 'number', 'boolean'].includes(typeof x);
  return Object.values(value as Record<string, unknown>).every(
    (v) => ok(v) || (Array.isArray(v) && v.length <= 50 && v.every(ok))
  );
}

/** Read this tool's pending input without removing it. Null when absent, stale or malformed. */
export function peekPendingInput(toolId: string, now = Date.now()): PendingInput | null {
  const s = storage();
  if (!s) return null;
  let raw: string | null = null;
  try {
    raw = s.getItem(PREFIX + toolId);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Stored<unknown>;
    if (parsed?.v !== VERSION || typeof parsed.ts !== 'number') return null;
    if (now - parsed.ts > PENDING_INPUT_TTL_MS || parsed.ts > now + 60_000) return null;
    return isPendingInput(parsed.input) ? parsed.input : null;
  } catch {
    return null;
  }
}

export function clearPendingInput(toolId: string): void {
  try {
    storage()?.removeItem(PREFIX + toolId);
  } catch {
    // ignore
  }
}

/** Read and remove this tool's pending input. */
export function consumePendingInput(toolId: string, now = Date.now()): PendingInput | null {
  const input = peekPendingInput(toolId, now);
  clearPendingInput(toolId);
  return input;
}
