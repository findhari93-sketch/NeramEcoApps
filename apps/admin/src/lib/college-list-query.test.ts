// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { parseCollegeListQuery } from './college-list-query';

const parse = (qs: string, def: number | null = null) => parseCollegeListQuery(new URLSearchParams(qs), def);

describe('parseCollegeListQuery', () => {
  it('returns everything when no limit is given (old behaviour)', () => {
    expect(parse('')).toEqual({ limit: null, offset: 0, search: '', tier: null, verified: null, optionsOnly: false });
  });

  it('honours limit and offset, capping the limit', () => {
    expect(parse('limit=25&offset=50')).toMatchObject({ limit: 25, offset: 50 });
    expect(parse('limit=100000').limit).toBe(500);
    expect(parse('limit=-3').limit).toBeNull();
    expect(parse('limit=abc&offset=10')).toMatchObject({ limit: null, offset: 0 });
  });

  it('uses a default page size when the caller sets one', () => {
    expect(parse('', 100)).toMatchObject({ limit: 100, offset: 0 });
    expect(parse('limit=20', 100).limit).toBe(20);
  });

  it('reads search, a valid tier, verified and the options projection', () => {
    expect(parse('q=%20anna%20&tier=platinum&verified=true&fields=options')).toMatchObject({
      search: 'anna',
      tier: 'platinum',
      verified: true,
      optionsOnly: true,
    });
    expect(parse('search=sri').search).toBe('sri');
    expect(parse('tier=diamond').tier).toBeNull();
    expect(parse('verified=false').verified).toBe(false);
  });
});
