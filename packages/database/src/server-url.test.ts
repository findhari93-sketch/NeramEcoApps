// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Server queries may skip the Cloudflare hop.
 *
 * NEXT_PUBLIC_SUPABASE_URL is db.neramclasses.com, a Cloudflare Worker that
 * exists because some Indian ISPs block supabase.co for BROWSERS. A Vercel
 * function in sin1 is not behind those ISPs, so with SUPABASE_SERVER_URL set
 * (https://<ref>.supabase.co) the server clients talk to Supabase directly:
 * one hop fewer on every query, so less function time.
 *
 * Two things must not change:
 *   - the browser keeps the public URL (it never sees the server-only env var);
 *   - URLs the server hands to browsers (storage public and signed URLs) keep
 *     the public host, because the client's base URL stays the public one and
 *     only the outgoing request is re-pointed.
 */

const PUBLIC = 'https://db.example.com';
const DIRECT = 'https://abcdefghijklmnop.supabase.co';

type Call = { url: string; init: RequestInit };
let calls: Call[];

const okFetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  calls.push({ url, init });
  return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
});

async function loadClient() {
  vi.resetModules();
  return import('./client');
}

beforeEach(() => {
  calls = [];
  okFetch.mockClear();
  vi.stubGlobal('fetch', okFetch);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', PUBLIC);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('toServerSupabaseUrl', () => {
  it('re-points a public Supabase URL at SUPABASE_SERVER_URL, keeping path and query', async () => {
    vi.stubEnv('SUPABASE_SERVER_URL', DIRECT);
    const { toServerSupabaseUrl } = await import('./fetch-deadline');
    expect(toServerSupabaseUrl(`${PUBLIC}/rest/v1/users?select=id`)).toBe(`${DIRECT}/rest/v1/users?select=id`);
  });

  it('accepts a trailing slash on the env value', async () => {
    vi.stubEnv('SUPABASE_SERVER_URL', `${DIRECT}/`);
    const { toServerSupabaseUrl } = await import('./fetch-deadline');
    expect(toServerSupabaseUrl(`${PUBLIC}/auth/v1/user`)).toBe(`${DIRECT}/auth/v1/user`);
  });

  it('handles URL and Request inputs', async () => {
    vi.stubEnv('SUPABASE_SERVER_URL', DIRECT);
    const { toServerSupabaseUrl } = await import('./fetch-deadline');
    expect(String(toServerSupabaseUrl(new URL(`${PUBLIC}/rest/v1/a`)))).toBe(`${DIRECT}/rest/v1/a`);
    const req = toServerSupabaseUrl(new Request(`${PUBLIC}/rest/v1/a`, { method: 'POST', body: '{}' })) as Request;
    expect(req.url).toBe(`${DIRECT}/rest/v1/a`);
    expect(req.method).toBe('POST');
  });

  it('leaves the URL alone when SUPABASE_SERVER_URL is unset, blank or invalid', async () => {
    const { toServerSupabaseUrl } = await import('./fetch-deadline');
    expect(toServerSupabaseUrl(`${PUBLIC}/rest/v1/a`)).toBe(`${PUBLIC}/rest/v1/a`);
    vi.stubEnv('SUPABASE_SERVER_URL', '   ');
    expect(toServerSupabaseUrl(`${PUBLIC}/rest/v1/a`)).toBe(`${PUBLIC}/rest/v1/a`);
    vi.stubEnv('SUPABASE_SERVER_URL', 'not a url');
    expect(toServerSupabaseUrl(`${PUBLIC}/rest/v1/a`)).toBe(`${PUBLIC}/rest/v1/a`);
  });

  it('never touches a URL on some other host', async () => {
    vi.stubEnv('SUPABASE_SERVER_URL', DIRECT);
    const { toServerSupabaseUrl } = await import('./fetch-deadline');
    expect(toServerSupabaseUrl('https://graph.microsoft.com/v1.0/me')).toBe('https://graph.microsoft.com/v1.0/me');
    // A lookalike host that merely starts with the public origin's text.
    expect(toServerSupabaseUrl('https://db.example.com.evil.test/rest/v1/a')).toBe('https://db.example.com.evil.test/rest/v1/a');
  });
});

describe('server clients with SUPABASE_SERVER_URL set', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_SERVER_URL', DIRECT);
  });

  it('admin client queries go straight to supabase.co, uncached', async () => {
    const { getSupabaseAdminClient } = await loadClient();
    await getSupabaseAdminClient().from('users').select('id');
    expect(calls[0].url.startsWith(`${DIRECT}/rest/v1/users`)).toBe(true);
    expect(calls[0].init.cache).toBe('no-store');
  });

  it('server (anon) client queries go straight to supabase.co, uncached', async () => {
    const { createServerClient } = await loadClient();
    await createServerClient().from('users').select('id');
    expect(calls[0].url.startsWith(`${DIRECT}/rest/v1/users`)).toBe(true);
    expect(calls[0].init.cache).toBe('no-store');
  });

  it('ISR client queries go straight to supabase.co and keep next.revalidate', async () => {
    const { createAdminClientISR } = await loadClient();
    await createAdminClientISR(86400).from('users').select('id');
    expect(calls[0].url.startsWith(`${DIRECT}/rest/v1/users`)).toBe(true);
    expect((calls[0].init as RequestInit & { next?: { revalidate?: number } }).next?.revalidate).toBe(86400);
  });

  it('storage public URLs handed to browsers keep the public proxy host', async () => {
    const { getSupabaseAdminClient } = await loadClient();
    const { data } = getSupabaseAdminClient().storage.from('avatars').getPublicUrl('a.png');
    expect(data.publicUrl.startsWith(`${PUBLIC}/storage/v1/object/public/avatars/a.png`)).toBe(true);
  });
});

describe('without SUPABASE_SERVER_URL (today)', () => {
  it('admin client keeps using the public proxy URL', async () => {
    const { getSupabaseAdminClient } = await loadClient();
    await getSupabaseAdminClient().from('users').select('id');
    expect(calls[0].url.startsWith(`${PUBLIC}/rest/v1/users`)).toBe(true);
  });
});
