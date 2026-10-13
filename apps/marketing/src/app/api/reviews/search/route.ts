/**
 * GET /api/reviews/search?exam=all|nata|jee&year=&city=&mode=&college=&locale=
 *
 * The /reviews filters (year, city, learning mode, college). The page itself
 * stays ISR and server-rendered for search engines; only a visitor who picks a
 * filter calls this.
 *
 * Cheap on purpose: it filters the same cached list the city pages read
 * (unstable_cache, daily, purged by the "reviews" tag) and answers with the
 * public CDN headers, so repeat filter combinations are served from the edge.
 * Published, moderated reviews only, and only the fields a card shows.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { loadAllPublishedReviews } from '@/lib/reviews/data';
import { applyReviewFilters, parseReviewFilters } from '@/lib/reviews/hub';
import { PUBLIC_CACHE_HEADERS } from '@/app/api/_lib/public-cache';

const LOCALES = ['en', 'ta', 'hi', 'kn', 'ml'];
const MAX_RESULTS = 60;

function examMatches(examType: string | null, exam: string): boolean {
  if (exam === 'nata') return examType === 'NATA' || examType === 'BOTH';
  if (exam === 'jee') return examType === 'JEE_PAPER_2' || examType === 'BOTH';
  return true;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const exam = ['nata', 'jee'].includes(params.get('exam') || '') ? (params.get('exam') as string) : 'all';
  const locale = LOCALES.includes(params.get('locale') || '') ? (params.get('locale') as string) : 'en';
  const filters = parseReviewFilters((k) => params.get(k));

  const all = await loadAllPublishedReviews(locale);
  const matched = applyReviewFilters(
    all.filter((r) => examMatches(r.examType, exam)),
    filters,
  );

  return NextResponse.json(
    { total: matched.length, reviews: matched.slice(0, MAX_RESULTS) },
    { headers: PUBLIC_CACHE_HEADERS },
  );
}
