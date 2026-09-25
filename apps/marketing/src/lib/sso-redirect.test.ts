import { describe, it, expect } from 'vitest';
import { safeSsoRedirect } from './sso-redirect';

const APP = 'https://app.neramclasses.com';

/**
 * 2026-09-25: /sso appended a Firebase custom token to any ?redirect= URL, so
 * one click on neramclasses.com/sso?redirect=https://attacker.example handed a
 * signed-in visitor's session to the attacker. Only our own hosts may receive it.
 */
describe('safeSsoRedirect', () => {
  it('keeps an app URL together with its query string', () => {
    const target = 'https://app.neramclasses.com/?utm_source=google&gclid=abc';
    expect(safeSsoRedirect(target, APP)).toBe(target);
  });

  it('accepts the staging hosts', () => {
    expect(safeSsoRedirect('https://staging-app.neramclasses.com/tools', APP)).toBe(
      'https://staging-app.neramclasses.com/tools'
    );
  });

  it('accepts the configured app origin in local dev', () => {
    expect(safeSsoRedirect('http://localhost:3011/login', 'http://localhost:3011')).toBe(
      'http://localhost:3011/login'
    );
  });

  it('refuses a foreign host and falls back to the app', () => {
    expect(safeSsoRedirect('https://attacker.example/steal', APP)).toBe(APP);
  });

  it('refuses a look-alike host', () => {
    expect(safeSsoRedirect('https://neramclasses.com.attacker.example/', APP)).toBe(APP);
    expect(safeSsoRedirect('https://evilneramclasses.com/', APP)).toBe(APP);
  });

  it('refuses plain http on our domain', () => {
    expect(safeSsoRedirect('http://app.neramclasses.com/', APP)).toBe(APP);
  });

  it('refuses script and unparseable targets', () => {
    expect(safeSsoRedirect('javascript:alert(1)', APP)).toBe(APP);
    expect(safeSsoRedirect('not a url', APP)).toBe(APP);
    expect(safeSsoRedirect(null, APP)).toBe(APP);
  });
});
