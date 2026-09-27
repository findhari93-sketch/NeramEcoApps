// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const resolveAdminCaller = vi.fn();
vi.mock('@/lib/admin-api-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/admin-api-auth')>('@/lib/admin-api-auth');
  return { ...actual, resolveAdminCaller: (...args: unknown[]) => resolveAdminCaller(...args) };
});

import { middleware, config } from './middleware';

/** The request headers Next will forward, read back from the middleware response. */
function forwarded(res: Response, name: string): string | null {
  return res.headers.get(`x-middleware-request-${name}`);
}

function req(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(`https://admin.neramclasses.com${path}`, init);
}

describe('admin API middleware', () => {
  const env = { ...process.env };
  beforeEach(() => {
    resolveAdminCaller.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.example.com';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
    delete process.env.ADMIN_API_AUTH_MODE;
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it('only runs on /api routes', () => {
    expect(config.matcher).toBe('/api/:path*');
  });

  it('refuses an unauthenticated call with the resolver status', async () => {
    resolveAdminCaller.mockResolvedValue({ ok: false, status: 401, error: 'Sign in again' });
    const res = await middleware(req('/api/crm/users'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Sign in again' });
  });

  it('stamps the verified id and overwrites a spoofed one', async () => {
    resolveAdminCaller.mockResolvedValue({ ok: true, userId: 'real-admin', userType: 'admin', via: 'graph' });
    const res = await middleware(
      req('/api/crm/alumni/abc/merge', {
        method: 'POST',
        headers: { authorization: 'Bearer t', 'x-neram-admin-id': 'someone-else' },
      }),
    );
    expect(res.status).toBe(200);
    expect(forwarded(res, 'x-neram-admin-id')).toBe('real-admin');
    expect(forwarded(res, 'x-neram-admin-type')).toBe('admin');
  });

  it('lets exempt routes through without verifying, and strips a spoofed id', async () => {
    for (const path of ['/api/auth/me', '/api/cron/auto-first-touch']) {
      const res = await middleware(req(path, { headers: { 'x-neram-admin-id': 'spoof' } }));
      expect(res.status).toBe(200);
      expect(forwarded(res, 'x-neram-admin-id')).toBeNull();
    }
    expect(resolveAdminCaller).not.toHaveBeenCalled();
  });

  it('passes preflight requests', async () => {
    const res = await middleware(req('/api/crm/users', { method: 'OPTIONS' }));
    expect(res.status).toBe(200);
    expect(resolveAdminCaller).not.toHaveBeenCalled();
  });

  it('report mode lets a refused call through without an admin id', async () => {
    process.env.ADMIN_API_AUTH_MODE = 'report';
    resolveAdminCaller.mockResolvedValue({ ok: false, status: 403, error: 'no' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await middleware(req('/api/crm/users', { headers: { 'x-neram-admin-id': 'spoof' } }));
    expect(res.status).toBe(200);
    expect(forwarded(res, 'x-neram-admin-id')).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('fails closed when the database is not configured', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const res = await middleware(req('/api/crm/users', { headers: { authorization: 'Bearer t' } }));
    expect(res.status).toBe(500);
    expect(resolveAdminCaller).not.toHaveBeenCalled();
  });
});
