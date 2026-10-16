import { describe, it, expect, vi } from 'vitest';
import { chatVisitorFromHeaders, deviceFromUserAgent, visitorCookie } from './visitor';
import { claimSignupNudge, SIGNUP_NUDGE_TAIL } from './signup-nudge';
import { parseAintraAnswer } from './rich/parse';

const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });
const ANON = `anon_${'c'.repeat(28)}4a1f`;

describe('deviceFromUserAgent', () => {
  it('names phones and browsers', () => {
    expect(
      deviceFromUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36')
    ).toBe('Android · Chrome');
    expect(
      deviceFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')
    ).toBe('iPhone · Safari');
    expect(
      deviceFromUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0')
    ).toBe('Windows · Edge');
    expect(deviceFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Instagram 300.0')).toBe('iPhone · In-app browser');
  });
  it('returns null when it cannot tell', () => {
    expect(deviceFromUserAgent(null)).toBeNull();
    expect(deviceFromUserAgent('curl/8.0')).toBeNull();
  });
});

describe('chatVisitorFromHeaders', () => {
  it('reads the visitor id, channel and landing page from cookies', () => {
    const touches = encodeURIComponent(
      JSON.stringify({ first: { landing_page: '/nata', channel: 'google_organic' }, last: { channel: 'youtube', landing_page: '/' } })
    );
    const v = chatVisitorFromHeaders(headers({ cookie: `a=1; neram_anon_id=${ANON}; neram_touches=${touches}` }));
    expect(v).toMatchObject({ anonymousId: ANON, minted: false, channel: 'youtube', landingPage: '/nata', device: null });
  });

  it('mints an id when the cookie is missing or forged', () => {
    const mint = () => `anon_${'d'.repeat(32)}`;
    expect(chatVisitorFromHeaders(headers({}), mint)).toMatchObject({ anonymousId: mint(), minted: true, channel: null });
    expect(chatVisitorFromHeaders(headers({ cookie: "neram_anon_id=x'; drop" }), mint).minted).toBe(true);
  });

  it('ignores a channel it does not know and a broken touch cookie', () => {
    const bad = encodeURIComponent(JSON.stringify({ last: { channel: 'spam' } }));
    expect(chatVisitorFromHeaders(headers({ cookie: `neram_touches=${bad}` })).channel).toBeNull();
    expect(chatVisitorFromHeaders(headers({ cookie: 'neram_touches=%7Bnot json' })).channel).toBeNull();
  });

  it('shares the minted cookie across neramclasses.com', () => {
    expect(visitorCookie(ANON, 'https://neramclasses.com/api/chat')).toContain('Domain=.neramclasses.com');
    expect(visitorCookie(ANON, 'http://localhost:3010/api/chat')).not.toContain('Secure');
  });
});

describe('claimSignupNudge', () => {
  function db(result: { data: unknown; error: unknown }) {
    const chain: any = {};
    chain.update = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.is = vi.fn(() => chain);
    chain.select = vi.fn(async () => result);
    return { from: vi.fn(() => chain), chain } as any;
  }

  it('claims a queued card once', async () => {
    const d = db({ data: [{ anonymous_id: ANON }], error: null });
    await expect(claimSignupNudge(d, { anonymousId: ANON, sessionId: 's1', signedIn: false })).resolves.toBe(true);
    expect(d.from).toHaveBeenCalledWith('aintra_signup_nudges');
    expect(d.chain.is).toHaveBeenCalledWith('shown_at', null);
  });

  it('shows nothing when no card is queued, the person is signed in, or the read fails', async () => {
    await expect(claimSignupNudge(db({ data: [], error: null }), { anonymousId: ANON, sessionId: 's', signedIn: false })).resolves.toBe(false);
    const signed = db({ data: [{}], error: null });
    await expect(claimSignupNudge(signed, { anonymousId: ANON, sessionId: 's', signedIn: true })).resolves.toBe(false);
    expect(signed.from).not.toHaveBeenCalled();
    await expect(claimSignupNudge(db({ data: null, error: { message: 'no table' } }), { anonymousId: ANON, sessionId: 's', signedIn: false })).resolves.toBe(false);
  });

  it('the tail renders as an Apply button', () => {
    const blocks = parseAintraAnswer(`Our fees start at 15,000.${SIGNUP_NUDGE_TAIL}`).blocks;
    expect(blocks.at(-1)).toEqual({ type: 'cta', actions: ['apply'] });
    expect(SIGNUP_NUDGE_TAIL).not.toMatch(/—|--/);
  });
});
