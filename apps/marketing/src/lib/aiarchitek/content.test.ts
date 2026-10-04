import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as content from './content';
import { LIVE_TOOLS, AI_FEATURES, AI_STATUS_LABEL, FAQS, JOURNEY, RESOURCE_LINKS, CITY_LINKS } from './content';
import { TOOL_BY_SLUG } from '@/lib/tools/configs';
import { lookupCity } from '@/lib/seo/location-pages';

// The 12 live, public tools in apps/app (LIVE_TOOL_IDS / tool-seo.ts paths).
const APP_LIVE_PATHS = [
  '/tools/nata/cutoff-calculator',
  '/tools/nata/exam-centers',
  '/tools/nata/eligibility-checker',
  '/tools/nata/cost-calculator',
  '/tools/nata/image-crop',
  '/tools/nata/exam-planner',
  '/tools/nata/question-bank',
  '/tools/counseling/college-predictor',
  '/tools/counseling/josaa-predictor',
  '/tools/counseling/rank-predictor',
  '/tools/counseling/insights',
  '/tools/counseling/coa-checker',
];

const APP_DIR = path.resolve(__dirname, '../../app/[locale]');

function allStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(allStrings);
  return [];
}

describe('aiArchitek content', () => {
  it('lists each of the 12 live app tools exactly once', () => {
    expect(LIVE_TOOLS.map((t) => t.appPath).sort()).toEqual([...APP_LIVE_PATHS].sort());
  });

  it('links every tool to an existing marketing guide', () => {
    for (const t of LIVE_TOOLS) expect(TOOL_BY_SLUG[t.slug], t.slug).toBeDefined();
    for (const j of JOURNEY) expect(LIVE_TOOLS.some((t) => t.slug === j.slug), j.slug).toBe(true);
  });

  it('links only to marketing pages that exist', () => {
    for (const { href } of RESOURCE_LINKS) {
      expect(fs.existsSync(path.join(APP_DIR, href, 'page.tsx')), href).toBe(true);
    }
    for (const { href } of CITY_LINKS) {
      const m = href.match(/^\/coaching\/nata-coaching\/(.+)$/);
      if (m) expect(lookupCity('nata', m[1]).kind, href).toBe('page');
      else if (href.startsWith('/coaching/nata-coaching-chennai/')) {
        expect(fs.existsSync(path.join(APP_DIR, href, 'page.tsx')), href).toBe(true);
      }
    }
  });

  it('gives every AI feature a known status and real copy', () => {
    for (const f of AI_FEATURES) {
      expect(Object.keys(AI_STATUS_LABEL)).toContain(f.status);
      expect(f.summary.length).toBeGreaterThan(10);
      expect(f.points.length).toBeGreaterThan(0);
    }
  });

  it('answers every FAQ directly', () => {
    expect(FAQS.length).toBeGreaterThanOrEqual(10);
    for (const f of FAQS) {
      expect(f.question.endsWith('?')).toBe(true);
      expect(f.answer.length).toBeGreaterThan(40);
    }
  });

  it('uses no em dashes or double dashes', () => {
    for (const s of allStrings(content)) {
      expect(s, s).not.toMatch(/—|--|&mdash;/);
    }
  });

  it('never names the competitor brand', () => {
    for (const s of allStrings(content)) {
      expect(s, s).not.toMatch(/\bi\s?arch\b/i);
    }
  });
});
