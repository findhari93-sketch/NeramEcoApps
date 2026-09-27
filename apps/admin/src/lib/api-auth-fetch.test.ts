// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { createAuthedFetch, isAdminApiRequest } from './api-auth-fetch';

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
