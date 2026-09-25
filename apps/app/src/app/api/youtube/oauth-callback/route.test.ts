// @vitest-environment node
import { describe, test, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * 2026-09-25: /api/youtube/subscribe stored any ?redirect= in a cookie and this
 * callback sent the visitor there (with their name and coupon on success). Only
 * our own hosts may be the destination.
 */

let redirectCookie: string | undefined;

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'youtube_redirect_url' && redirectCookie ? { value: redirectCookie } : undefined,
    delete: () => undefined,
  }),
}));

vi.mock('@/lib/youtube', () => ({
  exchangeCodeForToken: vi.fn(),
  subscribeToChannel: vi.fn(),
  getGoogleUserInfo: vi.fn(),
}));

vi.mock('@neram/database', () => ({ createServerClient: vi.fn() }));

vi.stubEnv('NEXT_PUBLIC_MARKETING_URL', 'https://neramclasses.com');

async function cancelledCallback() {
  const { GET } = await import('./route');
  const response = await GET(
    new NextRequest('https://app.neramclasses.com/api/youtube/oauth-callback?error=access_denied')
  );
  return new URL(response.headers.get('location') ?? '');
}

describe('GET /api/youtube/oauth-callback', () => {
  test('returns the visitor to the page they came from on our site', async () => {
    redirectCookie = 'https://neramclasses.com/youtube-subscribe';
    const location = await cancelledCallback();
    expect(location.host).toBe('neramclasses.com');
    expect(location.pathname).toBe('/youtube-subscribe');
  });

  test('never sends the visitor to a foreign host', async () => {
    redirectCookie = 'https://attacker.example/phish';
    const location = await cancelledCallback();
    expect(location.host).toBe('neramclasses.com');
  });
});
