import { describe, it, expect } from 'vitest';
import { isTrustedRedirect, safeRedirect, safeInternalPath, resolvePostAuthTarget } from './safe-redirect';

const MARKETING = 'https://neramclasses.com';

/**
 * 2026-09-25: /login?source=youtube_subscribe&redirect=<anything> stored the
 * raw redirect, and /api/youtube/subscribe-direct put a Firebase custom token
 * on it. One tap on "Subscribe with Google" handed the session to that host.
 * Only our own hosts may receive a signed-in visitor.
 */
describe('isTrustedRedirect', () => {
  it('accepts https on neramclasses.com and its subdomains', () => {
    expect(isTrustedRedirect('https://neramclasses.com/youtube-reward')).toBe(true);
    expect(isTrustedRedirect('https://www.neramclasses.com/')).toBe(true);
    expect(isTrustedRedirect('https://staging.neramclasses.com/fees?utm_source=x')).toBe(true);
  });

  it('accepts a configured origin, which is how localhost works in dev', () => {
    expect(isTrustedRedirect('http://localhost:3010/', ['http://localhost:3010'])).toBe(true);
  });

  it('refuses localhost when it is not a configured origin', () => {
    expect(isTrustedRedirect('http://localhost:3010/', [MARKETING])).toBe(false);
  });

  it('refuses foreign and look-alike hosts', () => {
    expect(isTrustedRedirect('https://attacker.example/steal')).toBe(false);
    expect(isTrustedRedirect('https://neramclasses.com.attacker.example/')).toBe(false);
    expect(isTrustedRedirect('https://evilneramclasses.com/')).toBe(false);
  });

  it('refuses plain http on our domain', () => {
    expect(isTrustedRedirect('http://neramclasses.com/')).toBe(false);
  });

  it('refuses relative, script and empty targets', () => {
    expect(isTrustedRedirect('//attacker.example')).toBe(false);
    expect(isTrustedRedirect('javascript:alert(1)')).toBe(false);
    expect(isTrustedRedirect('')).toBe(false);
    expect(isTrustedRedirect(null)).toBe(false);
    expect(isTrustedRedirect(undefined)).toBe(false);
  });
});

describe('safeRedirect', () => {
  it('keeps a trusted target', () => {
    expect(safeRedirect('https://neramclasses.com/a?b=1', MARKETING)).toBe('https://neramclasses.com/a?b=1');
  });

  it('falls back for an untrusted target', () => {
    expect(safeRedirect('https://attacker.example/', MARKETING)).toBe(MARKETING);
    expect(safeRedirect(null, MARKETING)).toBe(MARKETING);
  });
});

/**
 * 2026-10-01: public tool pages send signed-out visitors to
 * /login?redirect=/tools/... and the student must land back on that tool.
 * A relative path used to throw in new URL() and fall through to /dashboard.
 */
describe('safeInternalPath', () => {
  it('accepts app paths with a query', () => {
    expect(safeInternalPath('/tools/nata/cutoff-calculator')).toBe('/tools/nata/cutoff-calculator');
    expect(safeInternalPath('/tools/nata/exam-centers/tamil-nadu/hosur?x=1')).toBe(
      '/tools/nata/exam-centers/tamil-nadu/hosur?x=1'
    );
  });

  it('refuses protocol-relative, backslash and encoded host tricks', () => {
    expect(safeInternalPath('//evil.com')).toBeNull();
    expect(safeInternalPath('/\\evil.com')).toBeNull();
    expect(safeInternalPath('/%2F%2Fevil.com')).toBeNull();
    expect(safeInternalPath('/%5Cevil.com')).toBeNull();
    expect(safeInternalPath('/tools\n/x')).toBeNull();
  });

  it('refuses absolute URLs, login loops and API paths', () => {
    expect(safeInternalPath('https://evil.com/')).toBeNull();
    expect(safeInternalPath('javascript:alert(1)')).toBeNull();
    expect(safeInternalPath('/login?redirect=/x')).toBeNull();
    expect(safeInternalPath('/api/auth/exchange-token')).toBeNull();
  });

  it('refuses empty and very long values', () => {
    expect(safeInternalPath('')).toBeNull();
    expect(safeInternalPath(null)).toBeNull();
    expect(safeInternalPath('/' + 'a'.repeat(600))).toBeNull();
  });
});

describe('resolvePostAuthTarget', () => {
  const APP = 'https://app.neramclasses.com';

  it('sends a path back inside the app with no token', () => {
    expect(resolvePostAuthTarget('/tools/nata/cutoff-calculator', APP)).toEqual({
      kind: 'path',
      path: '/tools/nata/cutoff-calculator',
    });
  });

  it('never puts a token on a same-origin absolute URL', () => {
    expect(resolvePostAuthTarget(`${APP}/tools/nata/exam-centers?state=kerala`, APP, [MARKETING])).toEqual({
      kind: 'path',
      path: '/tools/nata/exam-centers?state=kerala',
    });
  });

  it('gives the marketing site a token', () => {
    expect(resolvePostAuthTarget('https://neramclasses.com/apply', APP, [MARKETING])).toEqual({
      kind: 'token',
      url: 'https://neramclasses.com/apply',
    });
  });

  it('falls back to the dashboard for foreign hosts and bad paths', () => {
    expect(resolvePostAuthTarget('https://attacker.example/', APP)).toEqual({ kind: 'dashboard' });
    expect(resolvePostAuthTarget('//attacker.example/', APP)).toEqual({ kind: 'dashboard' });
    expect(resolvePostAuthTarget(null, APP)).toEqual({ kind: 'dashboard' });
  });
});
