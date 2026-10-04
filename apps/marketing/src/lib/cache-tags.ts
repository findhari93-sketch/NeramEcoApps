/**
 * Cache tags for marketing content that staff edit in the admin app.
 *
 * Pages that read this content are ISR with a daily revalidate. When staff save
 * a change, the admin app POSTs the matching tags to /api/revalidate, which
 * calls revalidateTag() so the edit shows without waiting a day.
 *
 * The admin side keeps its own copy of these strings
 * (apps/admin/src/lib/marketing-revalidate.ts). Keep the two in sync.
 */
export const CACHE_TAGS = {
  /** Published testimonials: /reviews, /testimonials, /alumni, review cards. */
  reviews: 'reviews',
  /** public_review_stats(): the site-wide rating and review counts. */
  reviewStats: 'public-review-stats',
  /** Staff-verified public outcomes on /learner-stories. */
  learnerOutcomes: 'learner-outcomes',
  /** The #AskSeniors event and its college list (home page + /ask-seniors). */
  askSeniors: 'ask-seniors',
  /** Offline centres: /contact/[slug] and the core sitemap. */
  centers: 'centers',
  /** Published job postings: /careers/[slug]. */
  careers: 'careers',
} as const;

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS];

export const REVALIDATABLE_TAGS: readonly CacheTag[] = Object.values(CACHE_TAGS);

export function isRevalidatableTag(tag: unknown): tag is CacheTag {
  return typeof tag === 'string' && (REVALIDATABLE_TAGS as readonly string[]).includes(tag);
}
