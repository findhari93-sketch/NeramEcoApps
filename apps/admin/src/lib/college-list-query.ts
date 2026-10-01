/**
 * Query-string parsing for the admin college lists (/api/college-hub/colleges and
 * /api/college-outreach/list). Pure, so the bounds are unit-tested.
 */

export const COLLEGE_TIERS = ['free', 'silver', 'gold', 'platinum'] as const;
const MAX_LIMIT = 500;

export interface CollegeListQuery {
  /** null = no paging (return every row, the old behaviour). */
  limit: number | null;
  offset: number;
  search: string;
  tier: (typeof COLLEGE_TIERS)[number] | null;
  verified: boolean | null;
  optionsOnly: boolean;
}

export function parseCollegeListQuery(params: URLSearchParams, defaultLimit: number | null = null): CollegeListQuery {
  const rawLimit = params.get('limit');
  const n = rawLimit === null ? NaN : Number(rawLimit);
  const limit = Number.isFinite(n) && n > 0 ? Math.min(MAX_LIMIT, Math.floor(n)) : defaultLimit;
  const o = Number(params.get('offset'));
  const tier = params.get('tier');
  const verified = params.get('verified');
  return {
    limit,
    offset: limit !== null && Number.isFinite(o) && o > 0 ? Math.floor(o) : 0,
    search: (params.get('q') || params.get('search') || '').trim().slice(0, 100),
    tier: (COLLEGE_TIERS as readonly string[]).includes(tier || '') ? (tier as CollegeListQuery['tier']) : null,
    verified: verified === 'true' ? true : verified === 'false' ? false : null,
    optionsOnly: params.get('fields') === 'options',
  };
}
