// @vitest-environment node
import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { isTeamsPadPath } from './embedded';

describe('isTeamsPadPath', () => {
  it('recognises the pages Teams frames', () => {
    for (const pathname of ['/pad/teams', '/pad/teams/config', '/pad/stage', '/pad/stage/abc']) {
      expect({ pathname, teams: isTeamsPadPath(pathname) }).toEqual({ pathname, teams: true });
    }
  });

  it('leaves the browser pad pages and everything else on the normal Nexus sign-in', () => {
    for (const pathname of ['/pad', '/pad/r/482913', '/pad/teamsx', '/student/dashboard', '/', '', null, undefined]) {
      expect({ pathname, teams: isTeamsPadPath(pathname) }).toEqual({ pathname, teams: false });
    }
  });
});

/**
 * The deployed framing policy, read from the real apps/nexus/vercel.json and
 * applied the way Vercel applies header rules: every rule whose source matches,
 * in order, later values winning.
 */
describe('vercel.json framing headers', () => {
  const config = JSON.parse(readFileSync(path.resolve(__dirname, '../../../vercel.json'), 'utf-8')) as {
    headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
  };

  /** Enough of Vercel's path syntax for the sources in this file: groups, and :name* segments. */
  function sourcePattern(source: string): RegExp {
    const regex = source.replace(/\/:[a-zA-Z]+\*/g, '(?:/.*)?').replace(/:[a-zA-Z]+/g, '[^/]+');
    return new RegExp(`^${regex}$`);
  }

  function headersFor(pathname: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const rule of config.headers) {
      if (!sourcePattern(rule.source).test(pathname)) continue;
      for (const header of rule.headers) result[header.key.toLowerCase()] = header.value;
    }
    return result;
  }

  const TEAMS_HOSTS = [
    'https://teams.microsoft.com',
    'https://*.teams.microsoft.com',
    'https://*.cloud.microsoft',
    'https://*.microsoft365.com',
    'https://*.office.com',
  ];

  it('lets Teams and Microsoft 365 frame every Answer Pad page', () => {
    for (const pathname of ['/pad', '/pad/teams', '/pad/teams/config', '/pad/stage', '/pad/r/482913']) {
      const headers = headersFor(pathname);
      expect({ pathname, xfo: headers['x-frame-options'] }).toEqual({ pathname, xfo: undefined });
      const csp = headers['content-security-policy'] ?? '';
      expect(csp, pathname).toMatch(/^frame-ancestors 'self' /);
      for (const host of TEAMS_HOSTS) expect(csp, `${pathname} misses ${host}`).toContain(host);
      expect(headers['x-content-type-options']).toBe('nosniff');
    }
  });

  it('keeps every other page, and the pad API, unframeable by other sites', () => {
    for (const pathname of ['/', '/student/dashboard', '/teacher/answer-pad/sessions/abc', '/padding', '/api/pad/submit', '/login']) {
      const headers = headersFor(pathname);
      expect({ pathname, xfo: headers['x-frame-options'] }).toEqual({ pathname, xfo: 'SAMEORIGIN' });
      expect(headers['content-security-policy'], pathname).toBeUndefined();
    }
  });
});
