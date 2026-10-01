// @vitest-environment node
import { describe, it, expect } from 'vitest';
import robots from './robots';

type Rule = { userAgent?: string | string[]; allow?: string | string[]; disallow?: string | string[] };

const asList = (v: string | string[] | undefined) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const rules = () => asList(robots().rules as never) as unknown as Rule[];
const groupFor = (agent: string) => rules().find((r) => asList(r.userAgent).includes(agent));

describe('marketing robots.txt', () => {
  const star = groupFor('*')!;

  it('keeps the private and query-variant disallows on the * group', () => {
    const dis = asList(star.disallow);
    for (const path of ['/api/', '/enroll', '/s/', '/sso', '/*?utm_*', '/*?fbclid=*', '/*?center=*']) {
      expect(dis).toContain(path);
    }
    expect(asList(star.allow)).toContain('/');
  });

  it('never blocks /_next/ for any group (Google needs CSS and JS to render)', () => {
    for (const r of rules()) expect(asList(r.disallow)).not.toContain('/_next/');
  });

  it.each(['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'ClaudeBot', 'Google-Extended', 'Applebot-Extended'])(
    'AI crawler %s may read content but inherits the full * disallow list',
    (agent) => {
      const g = groupFor(agent);
      expect(g, `${agent} group`).toBeDefined();
      expect(asList(g!.allow)).toContain('/');
      expect(new Set(asList(g!.disallow))).toEqual(new Set(asList(star.disallow)));
    },
  );

  it.each(['Bytespider', 'CCBot'])('%s is disallowed entirely', (agent) => {
    const g = groupFor(agent);
    expect(g, `${agent} group`).toBeDefined();
    expect(asList(g!.disallow)).toEqual(['/']);
    expect(asList(g!.allow)).toEqual([]);
  });

  it('points to the sitemap index', () => {
    expect(robots().sitemap).toBe('https://neramclasses.com/sitemap.xml');
  });
});
