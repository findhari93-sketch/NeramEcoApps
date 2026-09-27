/**
 * Server-side reads for the review and story pages. Every read goes through the
 * ISR admin client (cached with the page, revalidated hourly) and fails soft:
 * a read error renders the empty state, never a 500.
 *
 * Only published rows are ever read: testimonials with publication_status
 * 'published' (consent and moderation already passed) and staff-verified
 * outcomes with is_public true.
 */

import {
  createAdminClientISR,
  getPublishedReviews,
  listLearnerOutcomes,
} from '@neram/database';
import {
  REVIEWS_PAGE_SIZE,
  localizedContent,
  ratingDistribution,
  type ReviewExam,
} from './rules';
import type { PublicOutcome, PublicReview } from './json-ld';

export const REVIEWS_REVALIDATE = 3600;

function client() {
  return createAdminClientISR(REVIEWS_REVALIDATE);
}

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
}

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
    const { reviews, total } = await getPublishedReviews(
      { exam, limit: REVIEWS_PAGE_SIZE, offset: (Math.max(1, page) - 1) * REVIEWS_PAGE_SIZE },
      client(),
    );
    return {
      reviews: (reviews as unknown as RawReview[]).map((r) => toPublicReview(r, locale)).filter((r) => r.body && r.displayName),
      total: Number(total) || 0,
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
    let query = (client().from('testimonials' as never) as any)
      .select('rating')
      .eq('publication_status', 'published')
      .not('rating', 'is', null)
      .limit(5000);
    if (exam === 'nata') query = query.in('exam_type', ['NATA', 'BOTH']);
    if (exam === 'jee') query = query.in('exam_type', ['JEE_PAPER_2', 'BOTH']);
    const { data, error } = await query;
    if (error) throw error;
    return ratingDistribution(((data as Array<{ rating: number | null }>) || []).map((r) => r.rating));
  } catch {
    return null;
  }
}

/** Published reviews that name the college the learner joined, for /alumni. */
export async function loadAlumniStories(locale: string, limit = 6): Promise<PublicReview[]> {
  try {
    const { reviews } = await getPublishedReviews({ exam: 'all', limit: 60, offset: 0 }, client());
    return (reviews as unknown as RawReview[])
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

    return {
      outcomes: rows.map((r) => {
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
      }),
      unavailable: false,
    };
  } catch (error) {
    console.error('[learner-stories] outcomes read failed:', error);
    return { outcomes: [], unavailable: true };
  }
}
