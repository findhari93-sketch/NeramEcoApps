// @vitest-environment node
import { readFileSync } from 'fs';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api-errors';
import { answerPadMigrationFiles } from './db/migration-files';
import { PAD_REFUSAL_STATUS, PadRefusal, callPad, padErrorResponse, padRefusalStatus } from './rpc';

/** Every refusal code the Answer Pad migrations (the base and each follow-up) can hand back. */
function refusalCodesInMigration(): string[] {
  const { base, followUps } = answerPadMigrationFiles();
  const sql = [base, ...followUps].map((file) => readFileSync(file, 'utf-8')).join('\n');

  const codes = new Set<string>();
  for (const match of sql.matchAll(/'code',\s*'([A-Z_]+)'/g)) codes.add(match[1]);
  // pad_reject(session, prompt, actor, 'action', 'CODE', ...): the code is the only upper-case literal.
  for (const call of sql.matchAll(/pad_reject\(([^;]*?)\)/g)) {
    for (const literal of call[1].matchAll(/'([A-Z][A-Z_]+)'/g)) codes.add(literal[1]);
  }
  return [...codes].sort();
}

function fakeClient(result: { data: unknown; error: unknown }) {
  return { rpc: vi.fn(async () => result) };
}

describe('refusal codes', () => {
  it('maps every refusal code the migration can return to a status', () => {
    const codes = refusalCodesInMigration();
    expect(codes.length).toBeGreaterThan(10);
    for (const code of codes) {
      expect({ code, mapped: code in PAD_REFUSAL_STATUS }).toEqual({ code, mapped: true });
    }
  });

  it('lists no code the migration never returns', () => {
    const codes = new Set(refusalCodesInMigration());
    expect(Object.keys(PAD_REFUSAL_STATUS).filter((code) => !codes.has(code))).toEqual([]);
  });

  it.each([
    ['NOT_FOUND', 404],
    ['ROOM_CODE_INVALID', 404],
    ['NOT_SESSION_TEACHER', 403],
    ['NOT_ENROLLED', 403],
    ['SESSION_CONFLICT', 409],
    ['PROMPT_NOT_OPEN', 409],
    ['INVALID_ANSWER', 400],
    ['RATE_LIMITED', 429],
  ])('answers %s with %i', (code, status) => {
    expect(padRefusalStatus(code)).toBe(status);
  });

  it('treats a code it does not know as a server error', () => {
    expect(padRefusalStatus('SOMETHING_NEW')).toBe(500);
  });
});

describe('callPad', () => {
  it('passes the arguments through and resolves the ok payload', async () => {
    const client = fakeClient({ data: { ok: true, session_id: 's1', resumed: false }, error: null });
    await expect(callPad(client, 'pad_start_or_resume_session', { p_actor: 'u1' })).resolves.toEqual({
      ok: true,
      session_id: 's1',
      resumed: false,
    });
    expect(client.rpc).toHaveBeenCalledWith('pad_start_or_resume_session', { p_actor: 'u1' });
  });

  it('throws a refusal carrying the code, the status and the detail', async () => {
    const client = fakeClient({ data: { ok: false, code: 'INVALID_TRANSITION', state: 'revealed' }, error: null });
    const refusal = await callPad(client, 'pad_close', {}).catch((err: unknown) => err);
    expect(refusal).toBeInstanceOf(PadRefusal);
    expect(refusal).toMatchObject({ code: 'INVALID_TRANSITION', status: 409, detail: { state: 'revealed' } });
  });

  it('names a refusal without a code UNKNOWN, which answers 500', async () => {
    const refusal = await callPad(fakeClient({ data: { ok: false }, error: null }), 'pad_close', {}).catch((err: unknown) => err);
    expect(refusal).toMatchObject({ code: 'UNKNOWN', status: 500 });
  });

  it('rethrows a transport or SQL error untouched', async () => {
    const pgError = { message: 'permission denied for function pad_close', code: '42501' };
    await expect(callPad(fakeClient({ data: null, error: pgError }), 'pad_close', {})).rejects.toBe(pgError);
  });

  it.each([null, 'text', [1, 2]])('refuses a malformed result %j', async (data) => {
    await expect(callPad(fakeClient({ data, error: null }), 'pad_close', {})).rejects.toThrow(/returned no result/);
  });
});

describe('padErrorResponse', () => {
  it('answers a refusal with its status, its code and its detail, and forbids caching it', async () => {
    const res = padErrorResponse(new PadRefusal('SESSION_CONFLICT', { existing: { session_id: 's1' } }), 'start');
    expect(res.status).toBe(409);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ error: 'SESSION_CONFLICT', code: 'SESSION_CONFLICT', existing: { session_id: 's1' } });
  });

  it('marks every error answer no-store, including a 500', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(padErrorResponse(new Error('Invalid Microsoft token: 401'), 'x').headers.get('Cache-Control')).toBe('no-store');
    expect(padErrorResponse(new Error('boom'), 'x').headers.get('Cache-Control')).toBe('no-store');
    log.mockRestore();
  });

  it('never lets refusal detail overwrite the code', async () => {
    const res = padErrorResponse(new PadRefusal('NOT_FOUND', { code: 'OTHER', error: 'spoofed' }), 'start');
    expect(await res.json()).toEqual({ error: 'NOT_FOUND', code: 'NOT_FOUND' });
  });

  it('keeps authentication and authorization failures with their own messages', async () => {
    const expired = padErrorResponse(new Error('Invalid Microsoft token: 401'), 'start');
    expect(expired.status).toBe(401);
    expect(await expired.json()).toEqual({ error: 'Invalid Microsoft token: 401' });

    const dark = padErrorResponse(new ApiError('Not found', 404), 'start');
    expect(dark.status).toBe(404);
  });

  it('never returns database text for an unexpected failure, and logs it instead', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const pgError = { message: 'relation "pad_sessions" does not exist', code: '42P01', details: null, hint: null };

    const res = padErrorResponse(pgError, 'start session');
    expect(res.status).toBe(500);
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain('pad_sessions');
    expect(body).not.toContain('42P01');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('42P01'));
    log.mockRestore();
  });
});
