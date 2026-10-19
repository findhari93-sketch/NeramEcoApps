// @vitest-environment node
import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * The deployed framing policy, read from the real apps/admin/vercel.json and
 * applied the way Vercel applies header rules: every rule whose source matches,
 * in order, later values winning. `pnpm dev:admin` never sends these headers,
 * which is how the bug below lived on prod only.
 *
 * MSAL renews an expired token (the SPA refresh token lasts about 24 hours) in a
 * hidden frame that comes back to admin.neramclasses.com/#code=... and is read
 * from there. With X-Frame-Options: DENY the browser refused that page, MSAL
 * waited out its 10 seconds and gave up, so the first load each day ended in
 * "Sign in again: no Microsoft token was sent." while the Microsoft session was
 * still good (2026-10-19). SAMEORIGIN lets our own frame load and still keeps
 * every other site from framing the dashboard, the same policy as Nexus.
 */
describe('admin vercel.json framing headers', () => {
  const config = JSON.parse(readFileSync(path.resolve(__dirname, '../../vercel.json'), 'utf-8')) as {
    headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
  };

  function headersFor(pathname: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const rule of config.headers) {
      if (!new RegExp(`^${rule.source}$`).test(pathname)) continue;
      for (const header of rule.headers) result[header.key.toLowerCase()] = header.value;
    }
    return result;
  }

  it('lets the Microsoft silent-renewal frame load our own pages, and no other site frame them', () => {
    for (const pathname of ['/', '/crm', '/centres', '/login']) {
      expect({ pathname, xfo: headersFor(pathname)['x-frame-options'] }).toEqual({ pathname, xfo: 'SAMEORIGIN' });
    }
  });

  it('never allows framing by another origin through a CSP', () => {
    const csp = headersFor('/')['content-security-policy'] ?? '';
    const ancestors = /frame-ancestors([^;]*)/.exec(csp)?.[1].trim();
    if (ancestors !== undefined) expect(ancestors).toBe("'self'");
  });
});
