import { describe, it, expect } from 'vitest';
import { STATES } from '@neram/geo';
import { INDIA_STATES } from '@neram/database/signup-geo';
import { buildChatGeoSummary, stateSlugFor } from './chat-geo';
import { INDIA_STATE_PATHS } from '@/components/chat-history/india-state-paths';

describe('stateSlugFor', () => {
  it('maps every state name the Cloudflare helper can emit', () => {
    for (const name of Object.values(INDIA_STATES)) {
      expect(stateSlugFor(name), name).not.toBeNull();
    }
  });

  it('maps ISO codes, old and new', () => {
    expect(stateSlugFor('TN')).toBe('tamil-nadu');
    expect(stateSlugFor('OR')).toBe('odisha');
    expect(stateSlugFor('od')).toBe('odisha');
    expect(stateSlugFor('UK')).toBe('uttarakhand');
    expect(stateSlugFor('TS')).toBe('telangana');
  });

  it('maps the spellings Cloudflare and the form actually use', () => {
    expect(stateSlugFor('National Capital Territory of Delhi')).toBe('delhi');
    expect(stateSlugFor('PUNJAB')).toBe('punjab');
    expect(stateSlugFor(' Tamil Nadu ')).toBe('tamil-nadu');
    expect(stateSlugFor('Orissa')).toBe('odisha');
    expect(stateSlugFor('Jammu & Kashmir')).toBe('jammu-and-kashmir');
    expect(stateSlugFor('Andaman and Nicobar Islands')).toBe('andaman-and-nicobar');
  });

  it('returns null for places that are not Indian states', () => {
    expect(stateSlugFor('Dubai')).toBeNull();
    expect(stateSlugFor('')).toBeNull();
    expect(stateSlugFor(null)).toBeNull();
  });
});

describe('the map', () => {
  it('has one path for every state and UT, keyed by its slug', () => {
    const pathSlugs = INDIA_STATE_PATHS.map((p) => p.slug).sort();
    expect(pathSlugs).toEqual(STATES.map((s) => s.slug).sort());
  });
});

describe('buildChatGeoSummary', () => {
  const raw = {
    total_sessions: 10,
    total_messages: 25,
    located_sessions: 7,
    india_sessions: 6,
    abroad_sessions: 1,
    india_no_state_sessions: 0,
    by_state: [
      { state: 'Tamil Nadu', sessions: 3, messages: 8 },
      { state: 'TN', sessions: 1, messages: 1 },
      { state: 'Telangana', sessions: 2, messages: 5 },
      { state: 'Atlantis', sessions: 0, messages: 0 },
    ],
    by_city: [
      { city: 'Chennai', state: 'Tamil Nadu', country: 'IN', sessions: 2 },
      { city: 'chennai ', state: 'TN', country: 'IN', sessions: 1 },
      { city: 'Dubai', state: 'Dubai', country: 'AE', sessions: 1 },
    ],
    by_country: [
      { country: 'IN', sessions: 6 },
      { country: 'AE', sessions: 1 },
    ],
    tracking_since: '2026-10-16T00:00:00Z',
  };

  it('merges spellings of one state and sorts by chatters', () => {
    const s = buildChatGeoSummary(raw);
    expect(s.states[0]).toMatchObject({ slug: 'tamil-nadu', name: 'Tamil Nadu', sessions: 4, messages: 9 });
    expect(s.states[1]).toMatchObject({ slug: 'telangana', sessions: 2 });
  });

  it('keeps an unmatched state as its own row so totals still add up', () => {
    const s = buildChatGeoSummary(raw);
    expect(s.states.find((x) => x.name === 'Atlantis')).toMatchObject({ slug: null });
  });

  it('merges case variants of a city within a state', () => {
    const s = buildChatGeoSummary(raw);
    expect(s.cities[0]).toMatchObject({ city: 'Chennai', region: 'Tamil Nadu', sessions: 3 });
  });

  it('labels a city abroad with its country', () => {
    const s = buildChatGeoSummary(raw);
    expect(s.cities.find((c) => c.city === 'Dubai')?.region).toBe('United Arab Emirates');
  });

  it('counts sessions without a place as unknown', () => {
    expect(buildChatGeoSummary(raw).totals.unknown).toBe(3);
  });

  it('survives an empty result', () => {
    const s = buildChatGeoSummary(null);
    expect(s.totals.sessions).toBe(0);
    expect(s.states).toEqual([]);
  });
});
