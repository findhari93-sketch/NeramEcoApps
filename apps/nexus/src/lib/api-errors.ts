/**
 * Consistent HTTP status codes for Nexus API route errors.
 *
 * The auth helpers (verifyMsToken / getRequestUser / assertStaff) throw plain
 * Errors. Without this, route catch blocks mapped every non-'Not authorized'
 * failure to 500, so an expired Microsoft token (Graph returns 401) surfaced as
 * a scary 500 and the client could not tell "session expired, sign in again"
 * from "the server broke". This helper classifies those messages so auth
 * failures return 401 and authorization failures return 403.
 */
import { NextResponse } from 'next/server';

/** Throw this when you already know the intended HTTP status. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Messages from verifyMsToken / getRequestUser that mean "not authenticated". */
const AUTH_FAILURE =
  /^(Missing or invalid Authorization header|Invalid Microsoft token|Invalid or expired impersonation token|Impersonation target is no longer valid|User not found|Test user not found|Invalid or expired parent session|Parent access has been revoked|Parent session is no longer valid|Parent account is no longer valid)/;

/**
 * The text of a thrown thing, whatever it turned out to be.
 *
 * Exported because `err instanceof Error ? err.message : 'Internal server error'`
 * is the idiom most route catch blocks reach for, and it is wrong here: a
 * PostgrestError is a plain object carrying message, details, hint and code, so
 * that ternary discards the entire explanation and logs the fallback. Every
 * Supabase failure then reads as one indistinguishable "Internal server error",
 * which is exactly how a constraint violation can look like a crash.
 */
export function messageOf(err: unknown, fallback = 'Request failed'): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message?: unknown }).message ?? fallback);
  }
  return fallback;
}

/**
 * Messages that mean "we know who you are, you may not be here".
 *
 * verifyMsToken's parent branch fails closed on any `par_` token for a route that
 * did not opt in, and getRequestUser rejects one again. That is the correct
 * behaviour, but the message was not classified here, so every one of the ~50
 * routes a parent can reach answered 500 instead of 403: a wrong-role request
 * looked to the client exactly like a broken server.
 */
const AUTHZ_FAILURE = /^(Not authorized|Parent accounts cannot access this resource\.)$/;

/** HTTP status for a thrown route error: 401 auth, 403 authorization, else 500. */
export function httpStatusForError(err: unknown): number {
  if (err instanceof ApiError) return err.status;
  const message = err instanceof Error ? err.message : '';
  if (AUTHZ_FAILURE.test(message)) return 403;
  if (AUTH_FAILURE.test(message)) return 401;
  return 500;
}

/**
 * Build the JSON error response for a caught route error, with the right status.
 * Keeps the original error message (falling back to `fallback` for non-Errors).
 */
export function errorResponse(err: unknown, fallback = 'Request failed'): NextResponse {
  return NextResponse.json(
    { error: messageOf(err, fallback) },
    { status: httpStatusForError(err) },
  );
}
