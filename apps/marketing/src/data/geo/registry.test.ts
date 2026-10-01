import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { HUB_REGISTRY } from '@/data/counselling-2026';
import { INDIAN_CITIES, GULF_CITIES, STATES, getCity, getState, resolveCitySlug, cityForName, stateSlugForName } from '.';
import CITY_ALIASES from './city-aliases.json';
import { CITY_CONTENT } from './content/cities';
import { STATE_CONTENT } from './content/states';

describe('location registry', () => {
  it('has all 28 states and 8 union territories', () => {
    expect(STATES.filter((s) => s.type === 'state')).toHaveLength(28);
    expect(STATES.filter((s) => s.type === 'ut')).toHaveLength(8);
  });

  it('has unique city slugs across India and the Gulf', () => {
    const slugs = [...INDIAN_CITIES, ...GULF_CITIES].map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('gives every state at least one city and every city a known state', () => {
    for (const c of INDIAN_CITIES) expect(getState(c.stateSlug), c.slug).toBeDefined();
    for (const s of STATES) expect(INDIAN_CITIES.some((c) => c.stateSlug === s.slug), s.slug).toBe(true);
  });

  it('keeps coordinates inside India (and the Gulf for Gulf cities)', () => {
    for (const c of INDIAN_CITIES) {
      expect(c.lat, c.slug).toBeGreaterThan(6);
      expect(c.lat, c.slug).toBeLessThan(37.5);
      expect(c.lng, c.slug).toBeGreaterThan(68);
      expect(c.lng, c.slug).toBeLessThan(97.5);
    }
    for (const g of GULF_CITIES) {
      expect(g.lat, g.slug).toBeGreaterThan(16);
      expect(g.lat, g.slug).toBeLessThan(30.5);
      expect(g.lng, g.slug).toBeGreaterThan(34);
      expect(g.lng, g.slug).toBeLessThan(60);
    }
  });

  it('keeps every city page URL that existed before the registry', () => {
    const legacy = fs.readFileSync(path.resolve(__dirname, '../../../../../packages/database/src/data/locations.ts'), 'utf8');
    const slugs = [...legacy.matchAll(/city: '([^']+)'/g)].map((m) => m[1]);
    expect(slugs.length).toBeGreaterThan(150);
    for (const slug of slugs) expect(getCity(slug), slug).toBeDefined();
  });

  it('points every alias at a real city and never shadows a real slug', () => {
    for (const [alias, target] of Object.entries(CITY_ALIASES as Record<string, string>)) {
      expect(getCity(alias), `${alias} is itself a page`).toBeUndefined();
      expect(getCity(target), `${alias} -> ${target}`).toBeDefined();
      expect(resolveCitySlug(alias)).toEqual({ slug: target, isAlias: true });
    }
  });

  it('maps every state counselling hub to the counselling registry', () => {
    const hubs = new Set(HUB_REGISTRY.map((h) => h.slug));
    for (const s of STATES) for (const h of s.counsellingHubs) expect(hubs.has(h), `${s.slug}: ${h}`).toBe(true);
  });

  it('keys hand content by real slugs', () => {
    for (const slug of Object.keys(CITY_CONTENT)) expect(getCity(slug), slug).toBeDefined();
    for (const slug of Object.keys(STATE_CONTENT)) expect(getState(slug), slug).toBeDefined();
  });

  it('keeps hand content free of em dashes and unverifiable claims', () => {
    const text = JSON.stringify([CITY_CONTENT, STATE_CONTENT]);
    expect(text).not.toMatch(/—|–|\s--\s/);
    expect(text).not.toMatch(/#\s?1\b|99\.9|150\+/);
  });

  it('resolves the place names colleges and test cities use', () => {
    expect(cityForName('Mysuru')).toBe('mysore');
    expect(cityForName('Tiruchirappalli')).toBe('trichy');
    expect(cityForName('Bengaluru')).toBe('bangalore');
    expect(cityForName('kancheepuram')).toBe('kanchipuram');
    expect(cityForName('Nowhere Town')).toBeNull();
    expect(stateSlugForName('Jammu & Kashmir')).toBe('jammu-and-kashmir');
    expect(stateSlugForName('Andaman & Nicobar')).toBe('andaman-and-nicobar');
  });
});
