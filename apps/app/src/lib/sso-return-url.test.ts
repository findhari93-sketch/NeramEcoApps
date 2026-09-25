import { describe, it, expect } from 'vitest';
import { ssoReturnUrl } from './sso-return-url';

/**
 * 2026-09-25: the SSO bounce to neramclasses.com/sso sent back only
 * origin + pathname, so a visitor who landed on app.neramclasses.com from a
 * campaign link lost utm_* and gclid before anything could read them.
 */
describe('ssoReturnUrl', () => {
  it('keeps the campaign query string through the SSO round trip', () => {
    expect(ssoReturnUrl('https://app.neramclasses.com/tools?utm_source=google&gclid=abc')).toBe(
      'https://app.neramclasses.com/tools?utm_source=google&gclid=abc'
    );
  });

  it('drops the SSO handshake params so a retry does not replay them', () => {
    expect(
      ssoReturnUrl('https://app.neramclasses.com/?utm_source=google&sso=error&authToken=x&signedOut=1')
    ).toBe('https://app.neramclasses.com/?utm_source=google');
  });

  it('returns a bare path when there is no query', () => {
    expect(ssoReturnUrl('https://app.neramclasses.com/tools')).toBe(
      'https://app.neramclasses.com/tools'
    );
  });
});
