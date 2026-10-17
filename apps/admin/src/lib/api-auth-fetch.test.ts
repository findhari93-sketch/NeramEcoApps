// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { createAuthedFetch, isAdminApiRequest } from './api-auth-fetch';
import { REAUTH_HEADER } from './admin-api-auth';

const ORIGIN = 'https://admin.neramclasses.com';

describe('isAdminApiRequest', () => {
  it('matches same-origin /api/ calls in every input form', () => {
    expect(isAdminApiRequest('/api/crm/users', ORIGIN)).toBe(true);
    expect(isAdminApiRequest(`${ORIGIN}/api/stats`, ORIGIN)).toBe(true);
    expect(isAdminApiRequest(new URL('/api/x', ORIGIN), ORIGIN)).toBe(true);
    expect(isAdminApiRequest(new Request(`${ORIGIN}/api/x`), ORIGIN)).toBe(true);
  });

  it('never matches another origin or a non-api path', () => {
    expect(isAdminApiRequest('https://graph.microsoft.com/v1.0/me', ORIGIN)).toBe(false);
    expect(isAdminApiRequest('https://nexus.neramclasses.com/api/x', ORIGIN)).toBe(false);
    expect(isAdminApiRequest('/apix', ORIGIN)).toBe(false);
    expect(isAdminApiRequest('/crm', ORIGIN)).toBe(false);
  });
});

describe('createAuthedFetch', () => {
  function setup(token: string | null = 'tok') {
    const base = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}'));
    const getToken = vi.fn(async () => token);
    const f = createAuthedFetch(base as unknown as typeof fetch, getToken, ORIGIN);
    const sentAuth = (i = 0) => new Headers(base.mock.calls[i][1]?.headers).get('authorization');
    return { base, getToken, f, sentAuth };
  }

  it('adds the bearer token and keeps existing headers and body', async () => {
    const { f, base, sentAuth } = setup();
    await f('/api/crm/users/1/disable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"reason":"x"}',
    });
    expect(sentAuth()).toBe('Bearer tok');
    const init = base.mock.calls[0][1]!;
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"reason":"x"}');
  });

  it('leaves other origins alone and never sends the token there', async () => {
    const { f, getToken, sentAuth } = setup();
    await f('https://graph.microsoft.com/v1.0/me');
    expect(getToken).not.toHaveBeenCalled();
    expect(sentAuth()).toBeNull();
  });

  it('respects a caller that already set Authorization', async () => {
    const { f, getToken, sentAuth } = setup();
    await f('/api/auth/me', { headers: { Authorization: 'Bearer mine' } });
    expect(getToken).not.toHaveBeenCalled();
    expect(sentAuth()).toBe('Bearer mine');
  });

  it('sends the request without a token when none is available', async () => {
    const { f, base, sentAuth } = setup(null);
    await f('/api/stats');
    expect(base).toHaveBeenCalledTimes(1);
    expect(sentAuth()).toBeNull();
  });
});

describe('createAuthedFetch with re-sign-in', () => {
  const expired = () => new Response('{"error":"x"}', { status: 401, headers: { [REAUTH_HEADER]: '1' } });

  function setup(opts: { token: string | null; fresh: string | null; responses?: Response[] }) {
    const queue = [...(opts.responses ?? [])];
    const base = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => queue.shift() ?? new Response('{}'));
    const getToken = vi.fn(async () => opts.token);
    const reauth = vi.fn(async () => opts.fresh);
    const f = createAuthedFetch(base as unknown as typeof fetch, getToken, ORIGIN, reauth);
    const sentAuth = (i = 0) => new Headers(base.mock.calls[i][1]?.headers).get('authorization');
    return { base, getToken, reauth, f, sentAuth };
  }

  it('asks the user to sign in again instead of sending a call with no token', async () => {
    const { f, base, reauth, sentAuth } = setup({ token: null, fresh: 'fresh' });
    const res = await f('/api/centres');
    expect(reauth).toHaveBeenCalledTimes(1);
    expect(base).toHaveBeenCalledTimes(1);
    expect(sentAuth()).toBe('Bearer fresh');
    expect(res.status).toBe(200);
  });

  it('still sends the call (and lets the route answer 401) when the user declines', async () => {
    const { f, base, sentAuth } = setup({ token: null, fresh: null });
    await f('/api/centres');
    expect(base).toHaveBeenCalledTimes(1);
    expect(sentAuth()).toBeNull();
  });

  it('retries a save once with a fresh token when the server says the token expired', async () => {
    const { f, base, reauth, sentAuth } = setup({ token: 'stale', fresh: 'fresh', responses: [expired()] });
    const res = await f('/api/centres/1', { method: 'PATCH', body: '{"a":1}' });
    expect(reauth).toHaveBeenCalledTimes(1);
    expect(base).toHaveBeenCalledTimes(2);
    expect(sentAuth(0)).toBe('Bearer stale');
    expect(sentAuth(1)).toBe('Bearer fresh');
    expect(base.mock.calls[1][1]?.body).toBe('{"a":1}');
    expect(base.mock.calls[1][1]?.method).toBe('PATCH');
    expect(res.status).toBe(200);
  });

  it('does not treat a route\'s own 401 as an expired sign-in', async () => {
    const { f, base, reauth } = setup({ token: 'tok', fresh: 'fresh', responses: [new Response('{}', { status: 401 })] });
    const res = await f('/api/whatever');
    expect(reauth).not.toHaveBeenCalled();
    expect(base).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(401);
  });

  it('returns the original 401 when re-sign-in gives nothing new', async () => {
    const { f, base } = setup({ token: 'stale', fresh: null, responses: [expired()] });
    const res = await f('/api/centres');
    expect(base).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(401);
  });

  it('never replays a streamed body it cannot send twice', async () => {
    const { f, base, reauth } = setup({ token: 'stale', fresh: 'fresh', responses: [expired()] });
    const body = new ReadableStream();
    const res = await f('/api/upload', { method: 'POST', body, duplex: 'half' } as RequestInit);
    expect(reauth).not.toHaveBeenCalled();
    expect(base).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(401);
  });
});
