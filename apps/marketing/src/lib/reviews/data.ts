/**
 * Server-side reads for the review and story pages. Every read goes through
 * unstable_cache (revalidated daily, tagged so admin saves purge it at once via
 * /api/revalidate) over the ISR admin client, and fails soft: a read error
 * renders the empty state, never a 500. Errors are not cached.
 *
 * Only published rows are ever read: testimonials with publication_status
 * 'published' (consent and moderation already passed) and staff-verified
 * outcomes with is_public true.
 */

import { unstable_cache } from 'next/cache';
import {
  createAdminClientISR,
  getPublishedReviews,
  listLearnerOutcomes,
} from '@neram/database';
import { CACHE_TAGS } from '@/lib/cache-tags';
import {
  REVIEWS_PAGE_SIZE,
  localizedContent,
  ratingDistribution,
  type ReviewExam,
} from './rules';
import type { PublicOutcome, PublicReview } from './json-ld';

export const REVIEWS_REVALIDATE = 86400;

function client() {
  return createAdminClientISR(REVIEWS_REVALIDATE);
}

/**
 * Raw published reviews for one exam scope and window. Cached per (exam, limit,
 * offset), not per locale: the locale mapping happens after the cache, so the
 * 5 locales share one entry.
 */
const readPublishedReviews = unstable_cache(
  async (exam: ReviewExam, limit: number, offset: number) => {
    const { reviews, total } = await getPublishedReviews({ exam, limit, offset }, client());
    return { reviews: reviews as unknown as RawReview[], total: Number(total) || 0 };
  },
  ['marketing-published-reviews-v1'],
  { revalidate: REVIEWS_REVALIDATE, tags: [CACHE_TAGS.reviews] },
);

const readRatings = unstable_cache(
  async (exam: ReviewExam): Promise<Array<number | null>> => {
    let query = (client().from('testimonials' as never) as any)
      .select('rating')
      .eq('publication_status', 'published')
      .not('rating', 'is', null)
      .limit(5000);
    if (exam === 'nata') query = query.in('exam_type', ['NATA', 'BOTH']);
    if (exam === 'jee') query = query.in('exam_type', ['JEE_PAPER_2', 'BOTH']);
    const { data, error } = await query;
    if (error) throw error;
    return ((data as Array<{ rating: number | null }>) || []).map((r) => r.rating);
  },
  ['marketing-review-ratings-v1'],
  { revalidate: REVIEWS_REVALIDATE, tags: [CACHE_TAGS.reviews] },
);

interface RawReview {
  id: string;
  display_name?: string | null;
  student_name?: string | null;
  student_photo?: string | null;
  content?: unknown;
  rating?: number | null;
  exam_type?: string | null;
  year?: number | null;
  city?: string | null;
  college_admitted?: string | null;
  course_name?: string | null;
  is_featured?: boolean | null;
  created_at?: string | null;
  rank?: number | null;
  percentile?: number | string | null;
  learning_mode?: string | null;
  is_verified_student?: boolean | null;
  center_id?: string | null;
}

const LEARNING_MODES = ['online', 'hybrid', 'offline'] as const;

export function toPublicReview(raw: RawReview, locale: string): PublicReview {
  return {
    id: raw.id,
    displayName: (raw.display_name || raw.student_name || '').trim(),
    body: localizedContent(raw.content, locale),
    rating: raw.rating == null ? null : Number(raw.rating),
    examType: raw.exam_type ?? null,
    year: raw.year ?? null,
    city: raw.city ?? null,
    collegeAdmitted: raw.college_admitted ?? null,
    courseName: raw.course_name ?? null,
    photo: raw.student_photo ?? null,
    isFeatured: !!raw.is_featured,
    createdAt: raw.created_at ?? null,
    rank: raw.rank == null ? null : Number(raw.rank),
    percentile: raw.percentile == null ? null : Number(raw.percentile),
    learningMode: (LEARNING_MODES as readonly string[]).includes(raw.learning_mode || '')
      ? (raw.learning_mode as PublicReview['learningMode'])
      : null,
    isVerified: !!raw.is_verified_student,
  };
}

export interface ReviewsPageData {
  reviews: PublicReview[];
  total: number;
  /** True when the read failed (e.g. the consent migration is not deployed yet). */
  unavailable: boolean;
}

export async function loadReviewsPage(exam: ReviewExam, page: number, locale: string): Promise<ReviewsPageData> {
  try {
    const { reviews, total } = await readPublishedReviews(
      exam,
      REVIEWS_PAGE_SIZE,
      (Math.max(1, page) - 1) * REVIEWS_PAGE_SIZE,
    );
    return {
      reviews: reviews.map((r) => toPublicReview(r, locale)).filter((r) => r.body && r.displayName),
      total,
      unavailable: false,
    };
  } catch (error) {
    // PGRST103: the page is past the last review (the route answers 404).
    if ((error as { code?: string })?.code === 'PGRST103') return { reviews: [], total: 0, unavailable: false };
    console.error('[reviews] published reviews read failed:', error);
    return { reviews: [], total: 0, unavailable: true };
  }
}

/** Star counts for the published reviews in scope, or null if unavailable. */
export async function loadRatingDistribution(exam: ReviewExam) {
  try {
    return ratingDistribution(await readRatings(exam));
  } catch {
    return null;
  }
}

/** Published reviews that name the college the learner joined, for /alumni. */
export async function loadAlumniStories(locale: string, limit = 6): Promise<PublicReview[]> {
  try {
    const { reviews } = await readPublishedReviews('all', 60, 0);
    return reviews
      .map((r) => toPublicReview(r, locale))
      .filter((r) => r.body && r.displayName && r.collegeAdmitted)
      .slice(0, limit);
  } catch (error) {
    console.error('[alumni] published stories read failed:', error);
    return [];
  }
}

interface RawOutcome {
  id: string;
  display_name?: string | null;
  exam?: string | null;
  exam_year?: number | null;
  college?: string | null;
  score?: number | null;
  max_score?: number | null;
  rank?: number | null;
  verification_status?: string | null;
}

/** Staff-verified, public outcomes, each with its /achievements slug when it has one. */
export async function loadLearnerStories(limit = 60): Promise<{ outcomes: PublicOutcome[]; unavailable: boolean }> {
  try {
    return { outcomes: await readLearnerOutcomes(limit), unavailable: false };
  } catch (error) {
    console.error('[learner-stories] outcomes read failed:', error);
    return { outcomes: [], unavailable: true };
  }
}

const readLearnerOutcomes = unstable_cache(
  async (limit: number): Promise<PublicOutcome[]> => {
    const supabase = client();
    const rows = ((await listLearnerOutcomes({ publicOnly: true, limit }, supabase)) as unknown as RawOutcome[]).filter(
      (r) => r.verification_status === 'verified' && (r.display_name || '').trim(),
    );

    // Outcome ids are 'result:<student_results.id>'; the public detail page is keyed by slug.
    const resultIds = rows.map((r) => String(r.id)).filter((id) => id.startsWith('result:')).map((id) => id.slice(7));
    const slugById = new Map<string, string>();
    if (resultIds.length > 0) {
      const { data } = await (supabase.from('student_results' as never) as any)
        .select('id, slug')
        .in('id', resultIds.slice(0, 200))
        .eq('is_published', true);
      for (const row of (data as Array<{ id: string; slug: string | null }>) || []) {
        if (row.slug) slugById.set(row.id, row.slug);
      }
    }

    return rows.map((r) => {
      const id = String(r.id);
      return {
        id,
        displayName: (r.display_name || '').trim(),
        exam: r.exam ?? null,
        examYear: r.exam_year ?? null,
        college: r.college ?? null,
        score: r.score == null ? null : Number(r.score),
        maxScore: r.max_score == null ? null : Number(r.max_score),
        rank: r.rank == null ? null : Number(r.rank),
        slug: id.startsWith('result:') ? slugById.get(id.slice(7)) ?? null : null,
      };
    });
  },
  ['marketing-learner-outcomes-v1'],
  { revalidate: REVIEWS_REVALIDATE, tags: [CACHE_TAGS.learnerOutcomes] },
);

/**
 * Published, moderated reviews for a city page. Read once (cached daily) and
 * filtered in memory: there are only a few hundred rows at most. When the city
 * has fewer than two, the page shows the state's reviews and says so.
 */
const readLocalReviews = unstable_cache(
  async (): Promise<RawReview[]> => {
    const { data, error } = await (client().from('testimonials' as never) as any)
      .select(
        'id, student_name, consent_display_name, student_photo, content, rating, exam_type, year, city, state, college_admitted, course_name, is_featured, created_at, ' +
          'rank, percentile, learning_mode, is_verified_student, center_id',
      )
      .eq('publication_status', 'published')
      .not('moderated_at', 'is', null)
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    return ((data as Array<RawReview & { consent_display_name?: string | null }>) || []).map((r) => ({
      ...r,
      display_name: r.consent_display_name ?? null,
    }));
  },
  ['marketing-local-reviews-v1'],
  { revalidate: REVIEWS_REVALIDATE, tags: [CACHE_TAGS.reviews] },
);

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

export async function loadLocalReviews(
  cityNames: string[],
  stateName: string | null,
  locale: string,
  limit = 4,
): Promise<{ scope: 'city' | 'state'; reviews: PublicReview[] }> {
  try {
    const rows = await readLocalReviews();
    const names = new Set(cityNames.map(norm).filter(Boolean));
    const city = rows.filter((r) => names.has(norm(r.city)));
    if (city.length >= 2 || !stateName) {
      return { scope: 'city', reviews: city.slice(0, limit).map((r) => toPublicReview(r, locale)) };
    }
    const state = rows.filter((r) => norm((r as RawReview & { state?: string | null }).state) === norm(stateName));
    return { scope: 'state', reviews: state.slice(0, limit).map((r) => toPublicReview(r, locale)) };
  } catch {
    return { scope: 'city', reviews: [] };
  }
}

// ── The /reviews hub as the source of truth (Phase 2) ──────────────────────

/** Every published, moderated review in the reader's language. Same cached read as the city pages. */
export async function loadAllPublishedReviews(locale: string): Promise<PublicReview[]> {
  try {
    const rows = await readLocalReviews();
    return rows.map((r) => toPublicReview(r, locale)).filter((r) => r.body && r.displayName);
  } catch (error) {
    console.error('[reviews] all published read failed:', error);
    return [];
  }
}

/** How many published reviews came from a verified review link: the switch-over gate. */
export async function loadVerifiedPublishedCount(): Promise<number> {
  try {
    const rows = await readLocalReviews();
    return rows.filter((r) => r.is_verified_student).length;
  } catch {
    return 0;
  }
}

/** Published reviews from students who studied this way, for the course pages. */
export async function loadReviewsByMode(
  modes: Array<'online' | 'hybrid' | 'offline'>,
  locale: string,
  limit = 4,
): Promise<PublicReview[]> {
  const all = await loadAllPublishedReviews(locale);
  return all.filter((r) => r.learningMode && modes.includes(r.learningMode)).slice(0, limit);
}

interface CentreProfileRow {
  name: string;
  city: string | null;
  rating: number | string | null;
  review_count: number | null;
  google_reviews_url: string | null;
  google_business_url: string | null;
}

/**
 * Google ratings per centre and the profile links for sameAs. Centres change
 * rarely; daily, and purged on centre saves through the "centers" tag.
 */
const readCentreProfiles = unstable_cache(
  async (): Promise<{ centres: CentreProfileRow[]; directoryUrls: string[] }> => {
    const supabase = client();
    const [{ data: centres, error }, { data: links }] = await Promise.all([
      (supabase.from('offline_centers' as never) as any)
        .select('name, city, rating, review_count, google_reviews_url, google_business_url')
        .eq('is_active', true),
      (supabase.from('review_platform_urls' as never) as any).select('review_url, platform').eq('is_active', true),
    ]);
    if (error) throw error;
    return {
      centres: (centres as CentreProfileRow[]) || [],
      // A directory's review URL doubles as its listing URL for sameAs.
      directoryUrls: ((links as Array<{ review_url: string; platform: string }>) || [])
        .filter((l) => l.platform !== 'google')
        .map((l) => l.review_url),
    };
  },
  ['marketing-centre-profiles-v1'],
  { revalidate: REVIEWS_REVALIDATE, tags: [CACHE_TAGS.centers] },
);

export async function loadCentreProfiles() {
  try {
    return await readCentreProfiles();
  } catch (error) {
    console.error('[reviews] centre profiles read failed:', error);
    return { centres: [] as CentreProfileRow[], directoryUrls: [] as string[] };
  }
}
