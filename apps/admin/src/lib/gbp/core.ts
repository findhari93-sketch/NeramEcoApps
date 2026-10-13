/**
 * Google Business Profile: the pure parts. No network, no database; unit tested
 * in core.test.ts.
 *
 *  - which credentials are missing (so the page can say exactly what to set),
 *  - turning an API review into our row,
 *  - matching a student's "I posted it" to a real Google review,
 *  - the reply instruction for AI drafts and the text of a success post.
 *
 * Every user-visible sentence here follows the project rule: no em dashes.
 */

export const GBP_ENV_VARS = ['GBP_CLIENT_ID', 'GBP_CLIENT_SECRET', 'GBP_REFRESH_TOKEN', 'GBP_ACCOUNT_ID'] as const;
export type GbpEnvVar = (typeof GBP_ENV_VARS)[number];

export interface GbpConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** The numeric account id, without the "accounts/" prefix. */
  accountId: string;
}

/** The config, or the list of env vars still missing. */
export function readGbpConfig(env: Record<string, string | undefined>): { config: GbpConfig } | { missing: GbpEnvVar[] } {
  const missing = GBP_ENV_VARS.filter((k) => !(env[k] || '').trim());
  if (missing.length) return { missing };
  return {
    config: {
      clientId: env.GBP_CLIENT_ID!.trim(),
      clientSecret: env.GBP_CLIENT_SECRET!.trim(),
      refreshToken: env.GBP_REFRESH_TOKEN!.trim(),
      accountId: env.GBP_ACCOUNT_ID!.trim().replace(/^accounts\//, ''),
    },
  };
}

// ── reviews ──────────────────────────────────────────────────────────────

const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

/** "FIVE" to 5. Unknown values are null, never a guess. */
export function starToNumber(value: unknown): number | null {
  return typeof value === 'string' && STARS[value] ? STARS[value] : null;
}

/** The shape the v4 reviews.list endpoint returns for one review. */
export interface ApiReview {
  name: string;
  reviewId?: string;
  reviewer?: { displayName?: string; profilePhotoUrl?: string; isAnonymous?: boolean };
  starRating?: string;
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewReply?: { comment?: string; updateTime?: string };
}

export interface GbpReviewRow {
  google_review_name: string;
  center_id: string | null;
  location_name: string;
  reviewer_name: string | null;
  reviewer_photo_url: string | null;
  star_rating: number | null;
  comment: string | null;
  create_time: string | null;
  update_time: string | null;
  reply_comment: string | null;
  reply_update_time: string | null;
  synced_at: string;
}

/**
 * Google appends a machine translation to some comments:
 * "Great classes\n\n(Translated by Google)\n...". Keep the student's own words.
 */
export function originalComment(comment: string | null | undefined): string | null {
  const text = (comment || '').trim();
  if (!text) return null;
  const marker = text.search(/\n\s*\(Translated by Google\)/i);
  const own = marker >= 0 ? text.slice(0, marker) : text;
  return own.replace(/^\(Original\)\s*/i, '').trim() || null;
}

export function toGbpReviewRow(review: ApiReview, locationName: string, centerId: string | null, now: string): GbpReviewRow {
  return {
    google_review_name: review.name,
    center_id: centerId,
    location_name: locationName,
    reviewer_name: review.reviewer?.isAnonymous ? null : review.reviewer?.displayName?.trim() || null,
    reviewer_photo_url: review.reviewer?.profilePhotoUrl || null,
    star_rating: starToNumber(review.starRating),
    comment: originalComment(review.comment),
    create_time: review.createTime || null,
    update_time: review.updateTime || null,
    reply_comment: review.reviewReply?.comment?.trim() || null,
    reply_update_time: review.reviewReply?.updateTime || null,
    synced_at: now,
  };
}

// ── matching "I posted it" to a real review ──────────────────────────────

const tokens = (name: string | null | undefined) =>
  (name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);

/**
 * How alike two names are, 0 to 1. Google shows whatever the student's Google
 * account is called ("Priya S", "priya sharma", "Priya Sharma 2007"), so this
 * compares words, and a first-name match counts for most of it.
 */
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  const first = ta[0] === tb[0] ? 0.6 : 0;
  const setB = new Set(tb);
  const shared = ta.filter((t) => setB.has(t)).length;
  // An initial ("S") matching a surname ("Sharma") counts a little.
  const initials = ta.slice(1).some((t) => tb.slice(1).some((u) => (t.length === 1 || u.length === 1) && t[0] === u[0])) ? 0.1 : 0;
  return Math.min(1, first + (shared / Math.max(ta.length, tb.length)) * 0.4 + initials);
}

export interface MatchableRequest {
  id: string;
  student_name: string;
  consent_display_name?: string | null;
  google_clicked_at: string | null;
  google_review_id: string | null;
}

export interface MatchableReview {
  google_review_name: string;
  reviewer_name: string | null;
  create_time: string | null;
}

/** A Google review must appear within this long after the student opened Google. */
export const MATCH_WINDOW_DAYS = 21;
/** Below this the names are too far apart to claim it is the same person. */
export const MATCH_MIN_SCORE = 0.6;

/**
 * Pair students who opened Google from their review link with the review they
 * posted. One review per student and one student per review, best score first.
 * A wrong match would tell staff someone posted who did not, so ties and weak
 * name matches are left unmatched.
 */
export function matchReviewsToRequests(
  reviews: MatchableReview[],
  requests: MatchableRequest[],
): Array<{ requestId: string; reviewName: string; score: number }> {
  const candidates: Array<{ requestId: string; reviewName: string; score: number }> = [];
  for (const req of requests) {
    if (req.google_review_id || !req.google_clicked_at) continue;
    const opened = Date.parse(req.google_clicked_at);
    for (const rev of reviews) {
      if (!rev.create_time) continue;
      const at = Date.parse(rev.create_time);
      // An hour of slack for clock skew; then the window.
      if (at < opened - 3_600_000 || at > opened + MATCH_WINDOW_DAYS * 86_400_000) continue;
      const score = Math.max(nameSimilarity(req.student_name, rev.reviewer_name), nameSimilarity(req.consent_display_name, rev.reviewer_name));
      if (score >= MATCH_MIN_SCORE) candidates.push({ requestId: req.id, reviewName: rev.google_review_name, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const usedReq = new Set<string>();
  const usedRev = new Set<string>();
  const out: typeof candidates = [];
  for (const c of candidates) {
    if (usedReq.has(c.requestId) || usedRev.has(c.reviewName)) continue;
    // Two equally good reviews for one student: too close to call.
    const rival = candidates.find((o) => o !== c && o.requestId === c.requestId && !usedRev.has(o.reviewName) && o.score === c.score);
    if (rival) continue;
    usedReq.add(c.requestId);
    usedRev.add(c.reviewName);
    out.push(c);
  }
  return out;
}

// ── replies and success posts ────────────────────────────────────────────

/**
 * The system instruction for an AI reply draft. Staff always read, edit and
 * press Post: a reply is public and signed by the business.
 */
export function buildReplyInstruction(input: { stars: number | null; centreCity: string | null }): string {
  const low = input.stars != null && input.stars <= 3;
  return [
    'You write the owner reply to a Google review of Neram Classes, an architecture entrance (NATA and JEE Paper 2) coaching institute in India.',
    'Rules:',
    '- Thank the reviewer by first name if they gave one. Warm, specific, human. Mention one concrete thing they said.',
    low
      ? '- This is a low rating. Apologise sincerely, do not argue or explain away, and invite them to call the Neram team so it can be put right. Do not ask them to change the review.'
      : '- Do not oversell. No claims about results, ranks or guarantees.',
    input.centreCity ? `- If it fits naturally, you may mention the ${input.centreCity} centre once.` : '',
    '- Never include phone numbers, email addresses or anyone\'s personal details.',
    '- 30 to 70 words. Plain English. No hashtags, no emoji.',
    '- Never use em dashes or double hyphens. Use commas or full stops.',
    '- Return only the reply text.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Swap em dashes and double hyphens for commas, for anything AI wrote. */
export function stripDashes(text: string): string {
  return text.replace(/\s*(?:—|--)\s*/g, ', ').replace(/,\s*,/g, ',').trim();
}

export interface SuccessFacts {
  firstName: string;
  examLabel: string;
  year: number | null;
  rank: number | null;
  percentile: number | null;
  college: string | null;
  centreCity: string | null;
  online: boolean;
}

/**
 * A Google profile Update celebrating a student's result. Only facts staff
 * verified; Google caps a post at 1,500 characters. No em dashes.
 */
export function successPostText(f: SuccessFacts): string {
  const result = f.rank ? `All India Rank ${f.rank}` : f.percentile != null ? `${f.percentile} percentile` : null;
  const exam = `${f.examLabel}${f.year ? ` ${f.year}` : ''}`;
  const lines = [
    `Congratulations, ${f.firstName}!`,
    result ? `${f.firstName} scored ${result} in ${exam}${f.college ? ` and joined ${f.college}` : ''}.` : `${f.firstName} cleared ${exam}${f.college ? ` and joined ${f.college}` : ''}.`,
    f.online
      ? `${f.firstName} prepared with Neram Classes online.`
      : f.centreCity
        ? `${f.firstName} prepared at our ${f.centreCity} centre.`
        : `${f.firstName} prepared with Neram Classes.`,
    'Read what our students say at neramclasses.com/reviews',
  ];
  return lines.join(' ').slice(0, 1500);
}
