/**
 * What every /api/assistant route answers when something throws, and the
 * request fields more than one route reads. Server only.
 */
import { NextResponse } from 'next/server';
import { ApiError, describeError, httpStatusForError } from '@/lib/api-errors';
import type { PageContext } from './types';

export const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/** The one sentence a student sees for a fault on our side. Never the database's own words. */
export const SERVER_FAULT = 'Something went wrong on my side. Please try again.';
const SESSION_ENDED = 'Your session has ended. Sign in again.';
const NO_ACCESS = 'Neram Assistant is not available on this account.';

/**
 * Ruling 26. An ApiError was thrown on purpose (the gate's 404 and 403, a
 * refusal): its status and message stand. Anything else is logged in full
 * with describeError and answered with a fixed sentence, so a column name, a
 * constraint or a Postgres code never reaches a student's screen. A rejected
 * token still answers 401, so the client can tell "sign in again" from "broken".
 */
export function assistantErrorResponse(err: unknown, where: string): NextResponse {
  if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status, headers: NO_STORE });
  console.error(`[assistant ${where}]`, describeError(err));
  const status = httpStatusForError(err);
  if (status === 401) return NextResponse.json({ error: SESSION_ENDED }, { status, headers: NO_STORE });
  if (status === 403) return NextResponse.json({ error: NO_ACCESS }, { status, headers: NO_STORE });
  return NextResponse.json({ error: SERVER_FAULT }, { status: 500, headers: NO_STORE });
}

/** A page context from a request body: a path (capped) and two optional ids, nothing else. */
export function readPage(raw: unknown): PageContext | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== 'object' || typeof r.path !== 'string') return null;
  const page: PageContext = { path: r.path.slice(0, 200) };
  if (typeof r.classroomId === 'string') page.classroomId = r.classroomId.slice(0, 64);
  if (typeof r.classId === 'string') page.classId = r.classId.slice(0, 64);
  return page;
}
