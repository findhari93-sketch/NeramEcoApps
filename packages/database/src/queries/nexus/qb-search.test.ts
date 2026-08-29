import { describe, it, expect, vi } from 'vitest';
import {
  extractSearchTerms,
  intersectIdFilters,
  orderByIds,
  searchQBQuestionIds,
} from './qb-search';

describe('extractSearchTerms', () => {
  it('splits a multi word query into highlightable terms', () => {
    expect(extractSearchTerms('lines parabo')).toEqual(['lines', 'parabo']);
  });

  it('strips LaTeX commands so "\\frac" is never highlighted as a word', () => {
    // Single-character operands fall below the 2-char floor, so a pasted
    // fraction contributes nothing to highlight. That is correct: highlighting
    // every "a" and "b" in a question would be noise, not help.
    expect(extractSearchTerms('\\frac{a}{b}')).toEqual([]);
    expect(extractSearchTerms('\\sqrt{area}')).toEqual(['area']);
  });

  it('lowercases and de-duplicates', () => {
    expect(extractSearchTerms('Parabola parabola PARABOLA')).toEqual(['parabola']);
  });

  it('drops single characters, which would highlight half the page', () => {
    expect(extractSearchTerms('y 2 area')).toEqual(['area']);
  });

  it('returns nothing for punctuation only input', () => {
    expect(extractSearchTerms('!!! ???')).toEqual([]);
    expect(extractSearchTerms('')).toEqual([]);
  });
});

describe('intersectIdFilters', () => {
  it('returns null when no filter is active, meaning unrestricted', () => {
    expect(intersectIdFilters([null, undefined])).toBeNull();
  });

  it('passes a single list through', () => {
    expect(intersectIdFilters([['a', 'b'], null])).toEqual(['a', 'b']);
  });

  it('intersects rather than concatenating', () => {
    // The old code applied successive .in('id', ...) calls, which Postgrest
    // ANDs. Anything other than an intersection here would silently widen
    // every filtered search.
    expect(intersectIdFilters([['a', 'b', 'c'], ['b', 'c', 'd'], ['c', 'b']]))
      .toEqual(['b', 'c']);
  });

  it('returns an empty array when the filters cannot overlap', () => {
    expect(intersectIdFilters([['a'], ['b']])).toEqual([]);
  });

  it('distinguishes "no filters" (null) from "filters matched nothing" ([])', () => {
    expect(intersectIdFilters([])).toBeNull();
    expect(intersectIdFilters([[]])).toEqual([]);
  });
});

describe('orderByIds', () => {
  it('restores rank order that .in() does not preserve', () => {
    const rows = [{ id: 'c' }, { id: 'a' }, { id: 'b' }];
    expect(orderByIds(rows, ['b', 'c', 'a']).map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('drops ids with no matching row instead of emitting holes', () => {
    const rows = [{ id: 'a' }];
    expect(orderByIds(rows, ['missing', 'a'])).toEqual([{ id: 'a' }]);
  });

  it('is empty when nothing matched', () => {
    expect(orderByIds([], ['a'])).toEqual([]);
  });
});

describe('searchQBQuestionIds', () => {
  const clientWith = (rows: unknown[]) => {
    const rpc = vi.fn().mockResolvedValue({ data: rows, error: null });
    return { client: { rpc } as any, rpc };
  };

  it('does not call the database for a blank query', async () => {
    const { client, rpc } = clientWith([]);
    const res = await searchQBQuestionIds(client, {}, {
      query: '   ', role: 'student', limit: 20, offset: 0,
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(res.ids).toEqual([]);
    expect(res.total).toBe(0);
  });

  it('short circuits when a prior filter already matched nothing', async () => {
    // An empty restrictIds array must never reach the RPC: null there means
    // "unrestricted", so passing [] through would return the whole bank.
    const { client, rpc } = clientWith([]);
    const res = await searchQBQuestionIds(client, {}, {
      query: 'parabola', role: 'student', restrictIds: [], limit: 20, offset: 0,
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(res.ids).toEqual([]);
    expect(res.matched_terms).toEqual(['parabola']);
  });

  it('sends the student role and never the teacher vector', async () => {
    const { client, rpc } = clientWith([]);
    await searchQBQuestionIds(client, {}, {
      query: 'parabola', role: 'student', limit: 20, offset: 0,
    });
    expect(rpc).toHaveBeenCalledWith('nexus_qb_search', expect.objectContaining({
      p_role: 'student',
      p_query: 'parabola',
    }));
  });

  it('maps rows to ranked ids, total and match metadata', async () => {
    const { client } = clientWith([
      { id: 'q1', rank: 0.9, match_kind: 'text', did_you_mean: null, total_count: 11 },
      { id: 'q2', rank: 0.4, match_kind: 'text', did_you_mean: null, total_count: 11 },
    ]);
    const res = await searchQBQuestionIds(client, {}, {
      query: 'lines parabo', role: 'teacher', limit: 20, offset: 0,
    });
    expect(res.ids).toEqual(['q1', 'q2']);
    expect(res.total).toBe(11);
    expect(res.match_kind).toBe('text');
    expect(res.matched_terms).toEqual(['lines', 'parabo']);
  });

  it('surfaces did_you_mean from the fuzzy path', async () => {
    const { client } = clientWith([
      { id: 'q1', rank: 0.56, match_kind: 'fuzzy', did_you_mean: 'parabola', total_count: 19 },
    ]);
    const res = await searchQBQuestionIds(client, {}, {
      query: 'parabloa', role: 'student', limit: 20, offset: 0,
    });
    expect(res.match_kind).toBe('fuzzy');
    expect(res.did_you_mean).toBe('parabola');
  });

  it('omits empty filter arrays so the RPC treats them as absent', async () => {
    const { client, rpc } = clientWith([]);
    await searchQBQuestionIds(client, { difficulty: [], categories: ['algebra'] }, {
      query: 'x', role: 'teacher', limit: 20, offset: 0,
    });
    const args = rpc.mock.calls[0][1];
    expect(args.p_difficulty).toBeNull();
    expect(args.p_categories).toEqual(['algebra']);
  });

  it('propagates RPC errors rather than returning an empty page', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: new Error('boom') });
    await expect(
      searchQBQuestionIds({ rpc } as any, {}, {
        query: 'x', role: 'teacher', limit: 20, offset: 0,
      }),
    ).rejects.toThrow('boom');
  });
});

describe('searchQBQuestionIds: missing migration', () => {
  it('explains a missing RPC instead of surfacing a bare 500', async () => {
    // GHA `supabase db push` has silently no-opped on this repo before, so the
    // app can reach production ahead of its migration. PostgREST answers
    // PGRST202 and the API route turns it into "Internal server error", which
    // says nothing. This turns it into an instruction.
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function public.nexus_qb_search' },
    });
    await expect(
      searchQBQuestionIds({ rpc } as any, {}, {
        query: 'parabola', role: 'student', limit: 20, offset: 0,
      }),
    ).rejects.toThrow(/nexus_qb_search function is missing/);
  });
});
