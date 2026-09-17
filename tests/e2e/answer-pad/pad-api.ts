/**
 * Shared helpers for the Answer Pad API specs. Not a spec itself (the file name
 * does not match *.spec.ts), so Playwright never runs it directly.
 *
 * Tokens are the non-production test_ tokens for existing staging E2E accounts,
 * minted here rather than through /api/auth/test-login, which re-tiers the
 * accounts it touches.
 */
import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { APP_URLS } from '../../utils/credentials';

export const NEXUS = APP_URLS.nexus;

/** Postgres and PostgREST text that must never reach a client. */
export const DATABASE_LEAK = /relation "|violates |syntax error|permission denied|PGRST\d|"code":\s*"[0-9A-Z]{5}"|pad_[a-z_]+\(/;

export const tokenFor = (email: string): string => `test_${Buffer.from(email).toString('base64')}`;
export const auth = (email: string) => ({ Authorization: `Bearer ${tokenFor(email)}` });

/** Parse a response, failing the test if it carries database text. */
export async function json(res: APIResponse): Promise<any> {
  const text = await res.text();
  expect(text, 'response leaks database text').not.toMatch(DATABASE_LEAK);
  return text ? JSON.parse(text) : null;
}

export function padApi(api: APIRequestContext) {
  const post = (email: string, path: string, data?: Record<string, unknown>) =>
    api.post(`${NEXUS}${path}`, { headers: auth(email), ...(data ? { data } : {}) });
  const get = (email: string, path: string) => api.get(`${NEXUS}${path}`, { headers: auth(email) });

  return {
    start: (email: string, data: Record<string, unknown> = {}) => post(email, '/api/pad/sessions', data),
    end: (email: string, sessionId: string, confirmUnrevealed = true) =>
      post(email, `/api/pad/sessions/${sessionId}/end`, { confirmUnrevealed }),
    snapshot: (email: string, sessionId: string) => get(email, `/api/pad/sessions/${sessionId}/snapshot`),
    join: (email: string, data: Record<string, unknown>) => post(email, '/api/pad/join', data),
    heartbeat: (email: string, sessionId: string) => post(email, '/api/pad/heartbeat', { sessionId }),
    ask: (email: string, data: Record<string, unknown>) => post(email, '/api/pad/prompts/ask', data),
    close: (email: string, promptId: string) => post(email, `/api/pad/prompts/${promptId}/close`),
    reopen: (email: string, promptId: string) => post(email, `/api/pad/prompts/${promptId}/reopen`),
    reveal: (email: string, promptId: string) => post(email, `/api/pad/prompts/${promptId}/reveal`),
    key: (email: string, promptId: string, data: Record<string, unknown>) => post(email, `/api/pad/prompts/${promptId}/key`, data),
    label: (email: string, promptId: string, label: string | null) => post(email, `/api/pad/prompts/${promptId}/label`, { label }),
    participation: (email: string, promptId: string) => get(email, `/api/pad/prompts/${promptId}/participation`),
    report: (email: string, sessionId: string) => get(email, `/api/pad/sessions/${sessionId}/report`),
    resend: (email: string, sessionId: string) => post(email, `/api/pad/sessions/${sessionId}/resend`),
    submit: (email: string, promptId: string, answer: string) => post(email, '/api/pad/submit', { promptId, answer }),
    me: (email: string) => get(email, '/api/auth/me'),
  };
}

export type PadApi = ReturnType<typeof padApi>;

/** End whatever live session an interrupted earlier run left for this teacher. */
export async function endLeftoverSession(pad: PadApi, email: string, classroomId: string): Promise<void> {
  const res = await pad.start(email, { classroomId });
  const data = await json(res);
  if (res.status() === 409 && data.code === 'SESSION_CONFLICT') {
    await pad.end(email, data.existing.session_id);
    const fresh = await json(await pad.start(email, { classroomId }));
    await pad.end(email, fresh.sessionId);
    return;
  }
  expect(res.status(), JSON.stringify(data)).toBe(200);
  await pad.end(email, data.sessionId);
}
