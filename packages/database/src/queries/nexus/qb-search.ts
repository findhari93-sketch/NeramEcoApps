/**
 * Question Bank search.
 *
 * Search used to be one line: `.ilike('question_text', '%term%')`. That needs
 * the typed words to appear as a single contiguous substring, so "lines parabo"
 * found nothing in a question reading "...two normal lines to the parabola...".
 * It also read only question_text, so options, explanations, tags and the NTA
 * paper id were all unsearchable, and results came back newest-first with no
 * notion of relevance.
 *
 * The ranking now lives in the nexus_qb_search RPC (see
 * supabase/migrations/20260903090200_nexus_qb_search_rpc.sql). This module is
 * the typed door to it.
 *
 * The RPC deliberately returns ranked IDS rather than question rows: the
 * callers in question-bank.ts already own tested enrichment code (sources,
 * topics, attempt summaries, usage counts), and returning ids lets that stay
 * exactly as it is.
 */

import type { TypedSupabaseClient } from '../../client';
import type { QBFilterState, QBQuestionStatus } from '../../types';

/** How the result set was found. Drives what the UI tells the user. */
export type QBMatchKind = 'text' | 'partial' | 'fuzzy';

export interface QBSearchMeta {
  /**
   * 'text'    every typed term matched
   * 'partial' only some matched, so the header should say results are broader
   *           than what was asked for
   * 'fuzzy'   nothing matched and these are trigram-similar guesses
   */
  match_kind: QBMatchKind | null;
  /** Best correction for a misspelling. Only ever set on the fuzzy path. */
  did_you_mean: string | null;
  /**
   * Normalized terms that were actually searched for, so the client can
   * highlight them. Deliberately NOT a server-rendered snippet: question text
   * is LaTeX, and wrapping a match inside `$...$` breaks KaTeX rendering.
   */
  matched_terms: string[];
}

export interface QBSearchPage extends QBSearchMeta {
  /** Question ids for this page, already in rank order. */
  ids: string[];
  total: number;
}

export interface QBSearchArgs {
  query: string;
  role: 'teacher' | 'student';
  /**
   * Candidate ids from filters the RPC cannot evaluate itself, already
   * intersected: paper sources, exam years, tag registry, attempt status.
   * `null` means unrestricted. An empty array means some filter matched
   * nothing, and the caller should short circuit before calling here.
   */
  restrictIds?: string[] | null;
  /**
   * Ids to remove from the result set. Exists for attempt_status
   * 'unattempted', which is an exclusion rather than a restriction and so
   * cannot be expressed through restrictIds.
   */
  excludeIds?: string[] | null;
  statuses?: QBQuestionStatus[] | null;
  /** Students see only active questions. */
  onlyActive?: boolean;
  limit: number;
  offset: number;
}

interface QBSearchRow {
  id: string;
  rank: number;
  match_kind: QBMatchKind;
  did_you_mean: string | null;
  total_count: number;
}

const EMPTY_PAGE: QBSearchPage = {
  ids: [],
  total: 0,
  match_kind: null,
  did_you_mean: null,
  matched_terms: [],
};

/**
 * Mirrors nexus_qb_search_normalize just far enough to know which words the
 * client should highlight. The database is the authority on matching; this is
 * only for presentation, so it stops at the cheap part (lower, strip LaTeX
 * punctuation, split) and skips the math expansion.
 */
export function extractSearchTerms(query: string): string[] {
  return Array.from(
    new Set(
      (query || '')
        .toLowerCase()
        .replace(/<[^>]*>/g, ' ')
        .replace(/\\[a-z]+/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .split(' ')
        .filter((t) => t.length >= 2),
    ),
  );
}

/** Intersect the optional id lists a caller resolved from its own filters. */
export function intersectIdFilters(lists: (string[] | null | undefined)[]): string[] | null {
  const present = lists.filter((l): l is string[] => Array.isArray(l));
  if (present.length === 0) return null;
  return present.reduce((acc, list) => {
    const set = new Set(list);
    return acc.filter((id) => set.has(id));
  });
}

export async function searchQBQuestionIds(
  supabase: TypedSupabaseClient,
  filters: QBFilterState,
  args: QBSearchArgs,
): Promise<QBSearchPage> {
  const query = (args.query || '').trim();
  if (!query) return EMPTY_PAGE;

  // A caller that already knows a filter matched nothing must not reach here:
  // an empty array would otherwise be indistinguishable from "unrestricted".
  if (Array.isArray(args.restrictIds) && args.restrictIds.length === 0) {
    return { ...EMPTY_PAGE, matched_terms: extractSearchTerms(query) };
  }

  const { data, error } = await (supabase as any).rpc('nexus_qb_search', {
    p_query: query,
    p_role: args.role,
    p_restrict_ids: args.restrictIds ?? null,
    p_exclude_ids: args.excludeIds?.length ? args.excludeIds : null,
    p_statuses: args.statuses?.length ? args.statuses : null,
    p_only_active: args.onlyActive ?? false,
    p_exam_relevance: filters.exam_relevance ?? null,
    p_categories: filters.categories?.length ? filters.categories : null,
    p_difficulty: filters.difficulty?.length ? filters.difficulty : null,
    p_question_format: filters.question_format?.length ? filters.question_format : null,
    p_origin: filters.origin?.length ? filters.origin : null,
    p_confidence_tier: filters.confidence_tier?.length
      ? filters.confidence_tier.map(String)
      : null,
    p_solution_filter: filters.solution_filter ?? null,
    p_limit: args.limit,
    p_offset: args.offset,
  });

  if (error) {
    // The RPC lives in 20260903090200_nexus_qb_search_rpc.sql. If the app ships
    // ahead of its migration, PostgREST answers PGRST202 and the API route
    // turns it into a bare "Internal server error", which has cost real
    // debugging time on this repo before. Say what is actually wrong.
    const code = (error as { code?: string }).code;
    const message = (error as { message?: string }).message ?? '';
    if (code === 'PGRST202' || /function .*nexus_qb_search.* does not exist/i.test(message)) {
      throw new Error(
        'Question Bank search is unavailable: the nexus_qb_search function is missing from this ' +
          'database. Apply supabase/migrations/20260903090000_*, 20260903090100_* and ' +
          '20260903090200_* before deploying this build.',
      );
    }
    throw error;
  }

  const rows = (data || []) as QBSearchRow[];
  const matched_terms = extractSearchTerms(query);

  if (rows.length === 0) {
    return { ...EMPTY_PAGE, matched_terms };
  }

  return {
    ids: rows.map((r) => r.id),
    total: Number(rows[0].total_count) || 0,
    match_kind: rows[0].match_kind ?? null,
    did_you_mean: rows[0].did_you_mean ?? null,
    matched_terms,
  };
}

/**
 * Restore the RPC's rank order.
 *
 * The rows come back from a follow-up `.in('id', ids)`, and Postgres makes no
 * promise about the order of an IN result. Without this the page would be
 * ranked by the RPC and then silently shuffled, which looks exactly like the
 * ranking not working.
 */
export function orderByIds<T extends { id: string }>(rows: T[], ids: string[]): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is T => r !== undefined);
}
