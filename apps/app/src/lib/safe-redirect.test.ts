import { describe, it, expect } from 'vitest';
import { isTrustedRedirect, safeRedirect } from './safe-redirect';

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
