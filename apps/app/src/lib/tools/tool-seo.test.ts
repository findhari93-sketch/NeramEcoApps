import { describe, it, expect } from 'vitest';
import { TOOL_CATALOG } from '@/lib/navigation-data';
import { allToolSeo, getToolSeoMap } from './tool-seo';
import { LIVE_TOOL_IDS } from './tool-ids';
import { nataCycleYear } from './cycle';

const strings = (v: unknown): string[] =>
  typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : [];

describe('tool SEO registry', () => {
  it('covers every live catalog tool with the same path', () => {
    const live = TOOL_CATALOG.filter((t) => !t.comingSoon);
    expect(live.map((t) => t.id).sort()).toEqual([...LIVE_TOOL_IDS].sort());
    const seo = getToolSeoMap();
    for (const t of live) expect(seo[t.id as keyof typeof seo].path).toBe(t.href);
  });

  it('has unique paths and fits title and description limits', () => {
    const tools = allToolSeo();
    expect(new Set(tools.map((t) => t.path)).size).toBe(tools.length);
    for (const t of tools) {
      expect(t.title.length, t.id).toBeLessThanOrEqual(60);
      expect(t.description.length, t.id).toBeLessThanOrEqual(160);
      expect(t.faqs.length, t.id).toBeGreaterThan(0);
    }
  });

  it('never uses em dashes or double hyphens in visible copy', () => {
    for (const t of allToolSeo()) {
      for (const s of strings(t)) {
        expect(s, `${t.id}: ${s}`).not.toMatch(/—|--|&mdash;/);
      }
    }
  });

  it('only links related tools that exist', () => {
    const ids = new Set<string>(LIVE_TOOL_IDS);
    for (const t of allToolSeo()) for (const r of t.related) expect(ids.has(r)).toBe(true);
  });
});

describe('nataCycleYear', () => {
  it('rolls over in September, India time', () => {
    expect(nataCycleYear(new Date('2026-08-31T12:00:00Z'))).toBe(2026);
    expect(nataCycleYear(new Date('2026-08-31T19:00:00Z'))).toBe(2027); // 00:30 IST on 1 Sep
    expect(nataCycleYear(new Date('2027-01-10T00:00:00Z'))).toBe(2027);
  });
});
