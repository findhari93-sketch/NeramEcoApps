/**
 * Browser-side calls to the AI Tutor. Never imported on the server.
 *
 * Plain fetch with `no-store`, never SWR: the SWR device cache persists to
 * localStorage, and a tutor turn is a write that must run once per press.
 */
import type { TutorEnvelope, TutorTurnRequest } from '@/lib/assistant/tutor/types';
import { AssistantHttpError, OFFLINE, type GetToken } from '@/components/assistant/client';

export { AssistantHttpError as TutorHttpError, OFFLINE } from '@/components/assistant/client';
export type { GetToken } from '@/components/assistant/client';

export const TUTOR_TURN_URL = '/api/assistant/tutor/turn';

/** What a status says when the server sent no sentence of its own. */
export function fallbackMessage(status: number): string {
  switch (status) {
    case 401:
      return 'Your session has ended. Sign in again.';
    case 403:
    case 404:
      return 'The tutor is not available for this question.';
    case 409:
      return 'You have a test open. Finish it first, then come back to the tutor.';
    case 400:
      return 'The tutor could not read that. Try again.';
    default:
      return 'The tutor could not answer just now. Try again.';
  }
}

/**
 * One tutor turn. A 4xx `{ error }` comes back as a thrown TutorHttpError
 * carrying the server's sentence and status (409 means a test is open). A
 * request that never reached the server is status 0 with the offline line.
 */
export async function postTutorTurn(getToken: GetToken, req: TutorTurnRequest): Promise<TutorEnvelope> {
  const token = await getToken();
  if (!token) throw new AssistantHttpError(fallbackMessage(401), 401);
  let res: Response;
  try {
    res = await fetch(TUTOR_TURN_URL, {
      method: 'POST',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
  } catch {
    throw new AssistantHttpError(OFFLINE, 0);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof body?.error === 'string' && body.error.trim() ? body.error : fallbackMessage(res.status);
    throw new AssistantHttpError(msg, res.status);
  }
  return body as TutorEnvelope;
}
