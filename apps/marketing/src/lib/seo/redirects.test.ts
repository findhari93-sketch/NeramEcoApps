/**
 * Runs the real next.config.js redirect table the way Next does: rules in order,
 * first match wins, path-to-regexp with strict matching. Guards the location SEO
 * URLs against catch-alls that swallow real pages and against redirect chains.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { pathToRegexp } = require('next/dist/compiled/path-to-regexp') as {
  pathToRegexp: (p: string, keys: Array<{ name: string | number }>, o: object) => RegExp;
};

interface Rule {
  source: string;
  destination: string;
  permanent?: boolean;
  has?: unknown[];
}

interface CompiledRule extends Rule {
  re: RegExp;
  keys: Array<{ name: string | number }>;
}

let rules: CompiledRule[] = [];

beforeAll(async () => {
  const configPath = path.resolve(__dirname, '../../../next.config.js');
  const config = require(configPath);
  const raw: Rule[] = await config.redirects();
  rules = raw
    // Host-conditional rules (www -> apex) never match a path-only lookup.
    .filter((r) => !r.has)
    .map((r) => {
      const keys: Array<{ name: string | number }> = [];
      const re = pathToRegexp(r.source, keys, { strict: true, sensitive: false, delimiter: '/' });
      return { ...r, re, keys };
    });
});

/** One redirect hop: the destination, or null when no rule matches. */
function resolveOnce(pathname: string): string | null {
  for (const rule of rules) {
    const m = rule.re.exec(pathname);
    if (!m) continue;
    const params: Record<string, string> = {};
    rule.keys.forEach((k, i) => {
      if (m[i + 1] !== undefined) params[String(k.name)] = m[i + 1];
    });
    if (/^https?:\/\//.test(rule.destination)) return rule.destination;
    return rule.destination.replace(/:([A-Za-z_]\w*)(\*|\+|\?)?(\([^)]*\))?/g, (_all, name: string) =>
      params[name] ?? '',
    );
  }
  return null;
}

describe('location redirects', () => {
  it('keeps the all-India directory at /coaching/nata-coaching (no redirect)', () => {
    expect(resolveOnce('/coaching/nata-coaching')).toBeNull();
  });

  it('sends /nata-coaching to the directory', () => {
    expect(resolveOnce('/nata-coaching')).toBe('/coaching/nata-coaching');
  });

  it('routes the old Chennai "centers in" URL to the city page, not a doubled slug', () => {
    expect(resolveOnce('/nata-coaching-centers-in-chennai')).toBe(
      '/coaching/nata-coaching/nata-coaching-centers-in-chennai',
    );
  });

  it('still maps old /nata-coaching-{city} URLs', () => {
    expect(resolveOnce('/nata-coaching-jaipur')).toBe('/coaching/nata-coaching/nata-coaching-centers-in-jaipur');
  });

  it('never redirects real state hubs, city pages or JEE location pages', () => {
    for (const p of [
      '/coaching/nata-coaching-in-tamil-nadu',
      '/coaching/jee-paper-2-coaching-in-kerala',
      '/coaching/nata-coaching/nata-coaching-centers-in-chennai',
      '/coaching/jee-paper-2-coaching/jee-paper-2-coaching-in-trichy',
      '/coaching/nata-coaching-chennai/adyar',
    ]) {
      expect(resolveOnce(p), p).toBeNull();
    }
  });

  it('maps legacy /coaching/{city} one segment deep only', () => {
    expect(resolveOnce('/coaching/jaipur')).toBe('/coaching/nata-coaching/nata-coaching-centers-in-jaipur');
    expect(resolveOnce('/coaching/jaipur/extra')).toBeNull();
  });

  it('sends non-English copies of location pages to English', () => {
    expect(resolveOnce('/ta/coaching/nata-coaching-in-kerala')).toBe('/coaching/nata-coaching-in-kerala');
    expect(resolveOnce('/hi/coaching/nata-coaching/nata-coaching-centers-in-delhi')).toBe(
      '/coaching/nata-coaching/nata-coaching-centers-in-delhi',
    );
    expect(resolveOnce('/ml/coaching/nata-coaching')).toBe('/coaching/nata-coaching');
  });

  it('points JEE Paper 2 coaching URLs at the one national target', () => {
    expect(resolveOnce('/jee-paper-2-coaching')).toBe('/jee-paper-2-preparation');
    expect(resolveOnce('/coaching/jee-paper-2-coaching')).toBe('/jee-paper-2-preparation');
  });

  it('lands legacy "near me" and -url URLs on the directory in one hop', () => {
    for (const p of ['/NATA-coaching-centers-nearby/x', '/speed-url', '/online-coaching-url', '/random-url']) {
      const first = resolveOnce(p);
      expect(first, p).toBe('/coaching/nata-coaching');
      expect(resolveOnce(first!), `${p} chained`).toBeNull();
    }
  });

  it('consolidates competing city pages into the one canonical page per city', () => {
    const chennai = '/coaching/nata-coaching/nata-coaching-centers-in-chennai';
    expect(resolveOnce('/nata-coaching/pune')).toBe('/coaching/nata-coaching/nata-coaching-centers-in-pune');
    expect(resolveOnce('/ta/nata-coaching/chennai')).toBe(chennai);
    expect(resolveOnce('/blog/best-nata-coaching-chennai')).toBe(chennai);
    expect(resolveOnce('/blog/best-nata-coaching-chennai-online')).toBe(chennai);
    expect(resolveOnce('/blog/best-nata-coaching-kuwait-city')).toBe('/coaching/nata-coaching/nata-coaching-centers-in-kuwait-city');
    expect(resolveOnce('/coaching/best-nata-coaching-chennai')).toBe(chennai);
    expect(resolveOnce('/coaching/nata-coaching-chennai')).toBe(chennai);
    expect(resolveOnce('/coaching/nata-coaching-center-in-tamil-nadu')).toBe('/coaching/nata-coaching-in-tamil-nadu');
    expect(resolveOnce('/coaching/nata-coaching-center')).toBe('/coaching/nata-coaching');
    // Chennai neighbourhood pages stay.
    expect(resolveOnce('/coaching/nata-coaching-chennai/adyar')).toBeNull();
    // Other blog posts are untouched.
    expect(resolveOnce('/blog/nata-2026-preparation-strategy')).toBeNull();
  });

  it('has no redirect chains for rules with a fixed destination', () => {
    expect(rules.length).toBeGreaterThan(100);
    const chains: string[] = [];
    for (const rule of rules) {
      const dest = rule.destination;
      if (dest.includes(':') && !/^https?:\/\//.test(dest)) continue;
      if (/^https?:\/\//.test(dest)) continue;
      const next = resolveOnce(dest);
      if (next !== null) chains.push(`${rule.source} -> ${dest} -> ${next}`);
    }
    expect(chains).toEqual([]);
  });
});
