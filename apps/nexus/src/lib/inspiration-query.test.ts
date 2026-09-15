import { describe, expect, it } from 'vitest';
import {
  EMPTY_QUERY,
  chipsFor,
  hasActiveFilters,
  parseInspirationQuery,
  parseScope,
  pickBackHref,
  toApiQuery,
  toFilters,
  toQueryPatch,
} from './inspiration-query';

describe('parseInspirationQuery', () => {
  it('reads a full query string', () => {
    expect(parseInspirationQuery('?q=bag%20hat&type=still_life,street_view&exam=NATA&by=alumni&year=2024&sort=newest')).toEqual({
      q: 'bag hat',
      types: ['still_life', 'street_view'],
      exam: 'NATA',
      by: 'alumni',
      year: 2024,
      sort: 'newest',
    });
  });

  it('drops anything it does not recognise', () => {
    expect(parseInspirationQuery('?type=../etc,DROP TABLE&exam=GATE&by=everyone&year=99999&sort=random')).toEqual(EMPTY_QUERY);
  });

  it('caps the query length and the number of types', () => {
    const long = 'a'.repeat(300);
    const state = parseInspirationQuery(`?q=${long}&type=a1,b2,c3,d4,e5,f6,g7`);
    expect(state.q).toHaveLength(100);
    expect(state.types).toHaveLength(6);
  });
});

describe('toQueryPatch and toApiQuery', () => {
  it('round-trips through the URL and leaves defaults out', () => {
    const state = { ...EMPTY_QUERY, q: 'bag', types: ['still_life'], year: 2025 };
    const patch = toQueryPatch(state);
    expect(patch).toEqual({ q: 'bag', type: 'still_life', exam: null, by: null, year: '2025', sort: null });
    const qs = toApiQuery(state, { offset: 0 });
    expect(qs).toBe('q=bag&type=still_life&year=2025');
    expect(parseInspirationQuery(`?${qs}`)).toEqual(state);
  });

  it('adds paging, scope and saved only when they differ from the default', () => {
    expect(toApiQuery(EMPTY_QUERY, { offset: 30, scope: 'hidden', savedOnly: true })).toBe('offset=30&scope=hidden&saved=1');
    expect(toApiQuery(EMPTY_QUERY, { offset: 0, scope: 'visible' })).toBe('');
  });
});

describe('parseScope, toFilters, hasActiveFilters', () => {
  it('only accepts known scopes', () => {
    expect(parseScope('hidden')).toBe('hidden');
    expect(parseScope('all')).toBe('all');
    expect(parseScope('everything')).toBe('visible');
    expect(parseScope(null)).toBe('visible');
  });

  it('builds query filters', () => {
    expect(toFilters({ ...EMPTY_QUERY, q: 'bag', exam: 'NATA' }, { offset: 30, limit: 30, scope: 'visible', savedOnly: false })).toEqual({
      query: 'bag', types: [], exam: 'NATA', by: undefined, year: undefined, sort: 'relevant', scope: 'visible', savedOnly: false, limit: 30, offset: 30,
    });
  });

  it('knows when a filter is on', () => {
    expect(hasActiveFilters(EMPTY_QUERY)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_QUERY, sort: 'newest' })).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_QUERY, year: 2024 })).toBe(true);
  });
});

describe('chipsFor', () => {
  const facets = [
    { value: 'still_life', label: 'Still Life', item_count: 3 },
    { value: 'street_view', label: 'Street View', item_count: 9 },
    { value: 'logo_design', label: 'Logo Design', item_count: 1 },
  ];

  it('puts selected chips first, even at zero, then the biggest', () => {
    expect(chipsFor(facets, ['poster_design'], 3).map((c) => [c.value, c.item_count])).toEqual([
      ['poster_design', 0],
      ['street_view', 9],
      ['still_life', 3],
    ]);
  });

  it('never cuts a selected chip to stay under the limit', () => {
    expect(chipsFor(facets, ['logo_design', 'still_life'], 1).map((c) => c.value)).toEqual(['logo_design', 'still_life']);
  });
});

describe('pickBackHref', () => {
  it('returns the stored results page for the same surface', () => {
    expect(pickBackHref('/student/inspiration?q=bag&type=still_life', '/student/inspiration')).toBe('/student/inspiration?q=bag&type=still_life');
    expect(pickBackHref('/student/inspiration/saved', '/student/inspiration')).toBe('/student/inspiration/saved');
  });

  it('refuses item pages, the other surface and anything else', () => {
    const base = '/student/inspiration';
    expect(pickBackHref('/student/inspiration/11111111-1111-4111-8111-111111111111', base)).toBe(base);
    expect(pickBackHref('/teacher/inspiration?q=bag', base)).toBe(base);
    expect(pickBackHref('https://evil.example/student/inspiration', base)).toBe(base);
    expect(pickBackHref(null, base)).toBe(base);
  });
});
