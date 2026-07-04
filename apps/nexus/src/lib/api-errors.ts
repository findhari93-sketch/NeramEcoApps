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
  /^(Missing or invalid Authorization header|Invalid Microsoft token|Invalid or expired impersonation token|Impersonation target is no longer valid|User not found|Test user not found)/;

function messageOf(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message?: unknown }).message ?? fallback);
  }
  return fallback;
}

/** HTTP status for a thrown route error: 401 auth, 403 authorization, else 500. */
export function httpStatusForError(err: unknown): number {
  if (err instanceof ApiError) return err.status;
  const message = err instanceof Error ? err.message : '';
  if (message === 'Not authorized') return 403;
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
