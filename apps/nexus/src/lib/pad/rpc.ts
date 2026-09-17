/**
 * Calling the Answer Pad database functions from /api/pad routes.
 *
 * Every pad_* function returns jsonb: {"ok": true, ...} or {"ok": false,
 * "code": "..."}. A refusal is a business answer, not a crash, so it travels to
 * the client with a status that says what kind of refusal it was plus the code
 * the UI branches on. Anything unexpected (a transport failure, an SQL error)
 * is logged in full and answered as a plain 500, never with database text.
 */

import { NextResponse } from 'next/server';
import { describeError, httpStatusForError, messageOf } from '@/lib/api-errors';

/**
 * One status per refusal code the migration can return. rpc.test.ts reads the
 * migration and fails if a code is missing here or listed here but never
 * returned, so the two cannot drift apart.
 */
export const PAD_REFUSAL_STATUS = {
  NOT_FOUND: 404,
  ROOM_CODE_INVALID: 404,
  NOT_STAFF: 403,
  NOT_SESSION_TEACHER: 403,
  NOT_ENROLLED: 403,
  SESSION_CONFLICT: 409,
  UNREVEALED_PROMPT: 409,
  INVALID_TRANSITION: 409,
  PROMPT_NOT_OPEN: 409,
  PROMPT_OPEN: 409,
  SESSION_NOT_LIVE: 409,
  KEY_REQUIRED: 409,
  INVALID_INPUT: 400,
  INVALID_KEY: 400,
  INVALID_ANSWER: 400,
  RATE_LIMITED: 429,
} as const;

export type PadRefusalCode = keyof typeof PAD_REFUSAL_STATUS;

export function padRefusalStatus(code: string): number {
  return (PAD_REFUSAL_STATUS as Record<string, number>)[code] ?? 500;
}

/** A pad_* function said no. Carries the code and whatever detail came with it. */
export class PadRefusal extends Error {
  readonly status: number;

  constructor(
    readonly code: string,
    readonly detail: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = 'PadRefusal';
    this.status = padRefusalStatus(code);
  }
}

/** The one method of the Supabase client this module needs. */
export interface PadRpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

/**
 * Call a pad_* function. Resolves with the {"ok": true} payload; throws
 * PadRefusal for {"ok": false}, and rethrows anything else untouched.
 */
export async function callPad<T extends Record<string, unknown> = Record<string, unknown>>(
  client: PadRpcClient,
  fn: `pad_${string}`,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${fn} returned no result`);
  }

  const result = data as Record<string, unknown>;
  if (result.ok === true) return result as T;

  const detail: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(result)) {
    if (key !== 'ok' && key !== 'code') detail[key] = value;
  }
  throw new PadRefusal(typeof result.code === 'string' ? result.code : 'UNKNOWN', detail);
}

/**
 * JSON that no cache along the way may keep: every pad answer describes a live
 * class that changes second by second, and some name students.
 */
export function padJson(body: unknown, init?: ResponseInit): NextResponse {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

/**
 * The response for anything a pad route caught.
 *
 * Not errorResponse from api-errors.ts: that one returns the thrown message,
 * which for a PostgrestError is database text naming our tables and columns.
 */
export function padErrorResponse(err: unknown, context: string): NextResponse {
  if (err instanceof PadRefusal) {
    return padJson({ ...err.detail, error: err.code, code: err.code }, { status: err.status });
  }

  const status = httpStatusForError(err);
  if (status !== 500) {
    // Authentication and authorization failures carry our own messages.
    return padJson({ error: messageOf(err) }, { status });
  }

  console.error(`[pad] ${context}: ${describeError(err)}`);
  return padJson({ error: 'Something went wrong. Please try again.' }, { status: 500 });
}
