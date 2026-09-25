// @vitest-environment node
import { describe, test, expect, vi } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * 2026-09-25: this route minted a Firebase custom token and put it on whatever
 * redirectUrl the browser sent. A /login?source=youtube_subscribe link with a
 * foreign redirect handed the visitor's session to that host. The token may
 * only ever travel to one of our own hosts.
 */

vi.mock('@/lib/firebase-admin', () => ({
  verifyIdToken: vi.fn(async () => ({ uid: 'firebase-uid-1', email: 's@example.com', name: 'Student' })),
  createCustomToken: vi.fn(async () => 'CUSTOM_TOKEN'),
}));

vi.mock('@/lib/youtube', () => ({
  subscribeToChannel: vi.fn(async () => ({
    success: true,
    subscription: { id: 'sub-1', subscribedAt: '2026-09-25T00:00:00Z' },
  })),
}));

// Every query resolves to one row, so the route takes the "existing user" path.
function fakeClient() {
  const result = { data: { id: 'user-1' }, error: null };
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'insert', 'update', 'upsert', 'order', 'limit']) {
    builder[method] = () => builder;
  }
  builder.single = async () => result;
  builder.maybeSingle = async () => result;
  builder.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return { from: () => builder };
}

vi.mock('@neram/database', () => ({ createServerClient: () => fakeClient() }));

vi.stubEnv('NEXT_PUBLIC_YOUTUBE_CHANNEL_ID', 'channel-1');
vi.stubEnv('NEXT_PUBLIC_MARKETING_URL', 'https://neramclasses.com');

async function post(redirectUrl: string) {
  const { POST } = await import('./route');
  const request = new Request('https://app.neramclasses.com/api/youtube/subscribe-direct', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: 'id', accessToken: 'yt', redirectUrl }),
  });
  const response = await POST(request as unknown as NextRequest);
  return response.json();
}

describe('POST /api/youtube/subscribe-direct', () => {
  test('sends the token back to our own site', async () => {
    const body = await post('https://neramclasses.com/youtube-subscribe');
    const url = new URL(body.redirectUrl);
    expect(url.host).toBe('neramclasses.com');
    expect(url.searchParams.get('authToken')).toBe('CUSTOM_TOKEN');
  });

  test('never puts the token on a foreign host', async () => {
    const body = await post('https://attacker.example/steal');
    const url = new URL(body.redirectUrl);
    expect(url.host).toBe('neramclasses.com');
    expect(body.redirectUrl).not.toContain('attacker.example');
  });
});
