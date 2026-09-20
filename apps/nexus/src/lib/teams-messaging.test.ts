import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { sendTeamsChatMessage } from './teams-messaging';

/**
 * Starting a 1:1 chat names BOTH members by their account.
 *
 * The teacher was bound as `https://graph.microsoft.com/v1.0/me`, which Graph
 * does not accept in user@odata.bind. Every chat from 14 to 17 Sept failed with
 * "400 BadRequest: 'user@odata.bind' field is missing in the request", 63 of
 * them, and students only heard through the Teams alert fallback.
 */

const TEACHER_OID = '11111111-2222-4333-8444-555555555555';

/** A token shaped like a Microsoft access token: only the payload is read. */
function tokenWith(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(payload)}.signature`;
}

function reply(ok: boolean, body: unknown = {}) {
  return {
    ok,
    status: ok ? 201 : 400,
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('sendTeamsChatMessage: who the chat is between', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('binds the teacher by their own account id, never by /me', async () => {
    let chatBody: any = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: any) => {
        if (url.endsWith('/chats')) {
          chatBody = JSON.parse(init.body);
          return reply(true, { id: 'chat-1' });
        }
        return reply(true);
      }),
    );

    const result = await sendTeamsChatMessage(tokenWith({ oid: TEACHER_OID }), 'student-oid', '<p>hi</p>');

    expect(result.ok).toBe(true);
    const binds = chatBody.members.map((m: any) => m['user@odata.bind']);
    expect(binds).toEqual([
      `https://graph.microsoft.com/v1.0/users('${TEACHER_OID}')`,
      "https://graph.microsoft.com/v1.0/users('student-oid')",
    ]);
    expect(binds.some((b: string) => b.endsWith('/me'))).toBe(false);
  });

  it('asks Graph who the teacher is when the token does not say', async () => {
    let chatBody: any = null;
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: any) => {
        calls.push(url);
        if (url.includes('/me?')) return reply(true, { id: TEACHER_OID });
        if (url.endsWith('/chats')) {
          chatBody = JSON.parse(init.body);
          return reply(true, { id: 'chat-1' });
        }
        return reply(true);
      }),
    );

    const result = await sendTeamsChatMessage('opaque-token', 'student-oid', '<p>hi</p>');

    expect(result.ok).toBe(true);
    expect(calls[0]).toContain('/me?');
    expect(chatBody.members[0]['user@odata.bind']).toBe(`https://graph.microsoft.com/v1.0/users('${TEACHER_OID}')`);
  });

  it('says why when the teacher cannot be identified, rather than sending a chat Graph will refuse', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        return reply(false, { error: { code: 'InvalidAuthenticationToken', message: 'expired' } });
      }),
    );

    const result = await sendTeamsChatMessage('opaque-token-2', 'student-oid', '<p>hi</p>');

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/could not tell which teacher/i);
    expect(calls.some((u) => u.endsWith('/chats'))).toBe(false);
  });
});
