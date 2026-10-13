/**
 * Review requests: one link asking a past student for a verified review.
 *
 * Shared by Admin (staff prefill and send the link, then edit and publish the
 * review in the testimonials queue) and Marketing (the public /r/<token> page the
 * student opens with no login).
 *
 * The row is the authority, not the token, exactly as in student-detail-requests:
 * expiry, cancellation and "already moderated" are read from here on every request,
 * so a link forwarded around WhatsApp can be withdrawn at once.
 *
 * The review itself lands in `testimonials` as a learner row. The trigger there
 * holds every learner row at pending_moderation, so nothing a student sends is
 * public until staff publish it.
 */

import { randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ReviewRequest,
  ReviewRequestStatus,
  ReviewSecondaryPlatform,
  TestimonialLearningMode,
} from '../types';
import { validateLearnerTestimonial } from './learner-feedback';

const TABLE = 'review_requests';

/** Long enough to sit in a WhatsApp thread through results season. */
export const REVIEW_REQUEST_TTL_DAYS = 30;

/** AI compose calls one link may make. Enough to re-record a few times. */
export const MAX_AI_CALLS_PER_REQUEST = 5;

/** At or below this, staff get a "Call this student" prompt. */
export const LOW_RATING_THRESHOLD = 3;

const LIVE: ReviewRequestStatus[] = ['active', 'opened', 'submitted'];
const EXAMS = ['NATA', 'JEE_PAPER_2', 'BOTH'] as const;
const MODES: TestimonialLearningMode[] = ['online', 'hybrid', 'offline'];

/** 32 random bytes, base64url, as student-detail-requests. Guessing is not a threat model. */
export function mintReviewRequestToken(): string {
  return randomBytes(32).toString('base64url');
}

// ---------------------------------------------------------------------------
// Pure helpers (unit tested)
// ---------------------------------------------------------------------------

/** Google's "write a review" link for a place, or null for a malformed id. */
export function googleWriteReviewLink(placeId: string | null | undefined): string | null {
  const id = (placeId ?? '').trim();
  return /^[A-Za-z0-9_-]{10,}$/.test(id) ? `https://search.google.com/local/writereview?placeid=${id}` : null;
}

export interface ReviewCentre {
  id: string;
  name: string;
  city?: string | null;
  center_type?: string | null;
  google_place_id?: string | null;
  google_reviews_url?: string | null;
}

export interface ReviewPlatformLink {
  center_id: string | null;
  platform: 'google' | 'sulekha' | 'justdial';
  review_url: string;
}

export interface GoogleTarget {
  url: string;
  centerId: string;
  centerName: string;
}

function googleUrlFor(centre: ReviewCentre | null | undefined, links: ReviewPlatformLink[]): string | null {
  if (!centre) return null;
  const configured = links.find((l) => l.center_id === centre.id && l.platform === 'google')?.review_url;
  return (
    (configured && configured.trim()) ||
    googleWriteReviewLink(centre.google_place_id) ||
    (centre.google_reviews_url && centre.google_reviews_url.trim()) ||
    null
  );
}

/**
 * The ONE Google profile this student is asked to review.
 *
 * Offline and hybrid students review the centre they attended. Online students
 * review headquarters, falling back to the centre staff picked. We never spread a
 * student over several profiles (the same text on many profiles is a spam signal)
 * and never send an online student to a centre picked only for its review count,
 * because a review has to reflect a real experience of that place.
 */
export function resolveGoogleTarget(input: {
  learningMode: TestimonialLearningMode | null;
  centre: ReviewCentre | null;
  headquarters: ReviewCentre | null;
  links: ReviewPlatformLink[];
}): GoogleTarget | null {
  const order =
    input.learningMode === 'online'
      ? [input.headquarters, input.centre]
      : [input.centre, input.learningMode == null ? input.headquarters : null];
  for (const c of order) {
    const url = googleUrlFor(c, input.links);
    if (c && url) return { url, centerId: c.id, centerName: c.name };
  }
  return null;
}

/**
 * The one directory to suggest after Google, rotated so JustDial and Sulekha fill
 * evenly instead of every student being asked for every platform.
 */
export function pickSecondaryPlatform(
  available: ReviewSecondaryPlatform[],
  usage: Partial<Record<ReviewSecondaryPlatform, number>>,
): ReviewSecondaryPlatform | null {
  if (!available.length) return null;
  return [...available].sort((a, b) => (usage[a] ?? 0) - (usage[b] ?? 0) || a.localeCompare(b))[0];
}

/** The directory link for a centre, falling back to headquarters. */
export function secondaryUrlFor(
  platform: ReviewSecondaryPlatform,
  centreId: string | null,
  headquartersId: string | null,
  links: ReviewPlatformLink[],
): string | null {
  for (const id of [centreId, headquartersId]) {
    if (!id) continue;
    const hit = links.find((l) => l.center_id === id && l.platform === platform);
    if (hit?.review_url?.trim()) return hit.review_url.trim();
  }
  return null;
}

export type ReviewRequestProgress =
  | 'not_sent'
  | 'sent'
  | 'opened'
  | 'submitted'
  | 'published'
  | 'posted_google'
  | 'expired'
  | 'cancelled';

export const REVIEW_PROGRESS_LABELS: Record<ReviewRequestProgress, string> = {
  not_sent: 'Not sent',
  sent: 'Sent',
  opened: 'Opened',
  submitted: 'Submitted',
  published: 'Published',
  posted_google: 'Posted on Google',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

/** The single chip staff see for a request. Furthest step wins. */
export function reviewRequestProgress(
  request: Pick<ReviewRequest, 'status' | 'sent_at' | 'opened_at' | 'submitted_at' | 'google_posted_self_reported_at'>,
  testimonialStatus?: string | null,
): ReviewRequestProgress {
  if (request.status === 'cancelled') return 'cancelled';
  if (request.google_posted_self_reported_at) return 'posted_google';
  if (testimonialStatus === 'published') return 'published';
  if (request.submitted_at) return 'submitted';
  if (request.status === 'expired') return 'expired';
  if (request.opened_at) return 'opened';
  if (request.sent_at) return 'sent';
  return 'not_sent';
}

export interface ReviewRequestInput {
  userId?: string | null;
  studentResultId?: string | null;
  studentName: string;
  photoUrl?: string | null;
  examType: (typeof EXAMS)[number];
  examYear?: number | null;
  airRank?: number | null;
  percentile?: number | null;
  score?: number | null;
  collegeAdmitted?: string | null;
  centerId?: string | null;
  city?: string | null;
  learningMode?: TestimonialLearningMode | null;
  phone?: string | null;
}

const clean = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(/\s+/g, ' ');
  return t ? t.slice(0, max) : null;
};
const int = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : NaN;
};

/** Staff input for a new request, checked the same way on client and server. */
export function sanitizeReviewRequestInput(
  raw: Record<string, unknown>,
  now: Date = new Date(),
): { ok: true; value: ReviewRequestInput } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const studentName = clean(raw.studentName, 80);
  if (!studentName || studentName.length < 2) errors.studentName = 'Add the student’s name.';

  const examType = (EXAMS as readonly string[]).includes(String(raw.examType)) ? (raw.examType as ReviewRequestInput['examType']) : null;
  if (!examType) errors.examType = 'Choose the exam.';

  const examYear = int(raw.examYear);
  if (examYear !== null && (Number.isNaN(examYear) || examYear < 2015 || examYear > now.getFullYear() + 1)) {
    errors.examYear = 'Choose a year between 2015 and next year.';
  }
  const airRank = int(raw.airRank);
  if (airRank !== null && (Number.isNaN(airRank) || airRank < 1 || airRank > 2_000_000)) errors.airRank = 'Rank must be a positive number.';
  const score = int(raw.score);
  if (score !== null && (Number.isNaN(score) || score < 0 || score > 1000)) errors.score = 'Score looks wrong.';

  let percentile: number | null = null;
  if (raw.percentile !== null && raw.percentile !== undefined && raw.percentile !== '') {
    const p = Number(raw.percentile);
    if (!Number.isFinite(p) || p < 0 || p > 100) errors.percentile = 'Percentile is between 0 and 100.';
    else percentile = Math.round(p * 1000) / 1000;
  }

  const learningMode = MODES.includes(raw.learningMode as TestimonialLearningMode) ? (raw.learningMode as TestimonialLearningMode) : null;
  const phoneDigits = typeof raw.phone === 'string' ? raw.phone.replace(/[^\d+]/g, '') : '';
  if (phoneDigits && phoneDigits.replace(/\D/g, '').length < 10) errors.phone = 'Phone number looks short.';
  const photoUrl = clean(raw.photoUrl, 600);
  if (photoUrl && !/^https:\/\//.test(photoUrl)) errors.photoUrl = 'Photo must be an https link.';

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      userId: clean(raw.userId, 64),
      studentResultId: clean(raw.studentResultId, 64),
      studentName: studentName!,
      photoUrl,
      examType: examType!,
      examYear,
      airRank,
      percentile,
      score,
      collegeAdmitted: clean(raw.collegeAdmitted, 120),
      centerId: clean(raw.centerId, 64),
      city: clean(raw.city, 60),
      learningMode,
      phone: phoneDigits || null,
    },
  };
}

/** The facts a student may correct on their own card. Anything else is dropped. */
export const CORRECTABLE_FIELDS = ['college_admitted', 'air_rank', 'percentile', 'exam_year', 'city'] as const;
export type CorrectableField = (typeof CORRECTABLE_FIELDS)[number];

export function sanitizeCorrections(
  raw: unknown,
  request: Pick<ReviewRequest, CorrectableField>,
): Partial<Record<CorrectableField, string>> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Partial<Record<CorrectableField, string>> = {};
  for (const key of CORRECTABLE_FIELDS) {
    const v = clean((raw as Record<string, unknown>)[key] as unknown, 120);
    if (v === null) continue;
    // Only a real change counts as a correction.
    if (String(request[key] ?? '') === v) continue;
    if ((key === 'air_rank' || key === 'exam_year') && !/^\d{1,7}$/.test(v)) continue;
    if (key === 'percentile' && !(Number(v) >= 0 && Number(v) <= 100)) continue;
    out[key] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Link lifecycle
// ---------------------------------------------------------------------------

/** Expire every live link past its time, lazily on read (no cron). */
export async function expireOldReviewRequests(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ status: 'expired' as ReviewRequestStatus })
    .in('status', ['active', 'opened'])
    .lt('expires_at', new Date().toISOString())
    .select('id');
  if (error) throw error;
  return data?.length || 0;
}

async function liveRequestForUser(userId: string, supabase: SupabaseClient): Promise<ReviewRequest | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .in('status', LIVE)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as ReviewRequest) || null;
}

/** Withdraw a link. After this the token opens nothing. */
export async function cancelReviewRequest(id: string, cancelledBy: string | null, supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({ status: 'cancelled' as ReviewRequestStatus, cancelled_by: cancelledBy, cancelled_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

function toRow(input: ReviewRequestInput) {
  return {
    user_id: input.userId ?? null,
    student_result_id: input.studentResultId ?? null,
    student_name: input.studentName,
    photo_url: input.photoUrl ?? null,
    exam_type: input.examType,
    exam_year: input.examYear ?? null,
    air_rank: input.airRank ?? null,
    percentile: input.percentile ?? null,
    score: input.score ?? null,
    college_admitted: input.collegeAdmitted ?? null,
    center_id: input.centerId ?? null,
    city: input.city ?? null,
    learning_mode: input.learningMode ?? null,
    phone: input.phone ?? null,
  };
}

/**
 * Make a link, or hand back the live one for a known student.
 *
 * Reusing is deliberate: pressing the button twice must not kill the link already
 * sent. `regenerate` cancels the old row FIRST, because review_requests_one_live_per_user
 * is a partial unique index and insert-then-cancel would be refused.
 */
export async function createReviewRequest(
  input: ReviewRequestInput,
  createdBy: string | null,
  supabase: SupabaseClient,
  options: { regenerate?: boolean } = {},
): Promise<{ request: ReviewRequest; reused: boolean }> {
  await expireOldReviewRequests(supabase);

  if (input.userId) {
    const existing = await liveRequestForUser(input.userId, supabase);
    if (existing && !options.regenerate) return { request: existing, reused: true };
    if (existing) await cancelReviewRequest(existing.id, createdBy, supabase);
  }

  const expiresAt = new Date(Date.now() + REVIEW_REQUEST_TTL_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      ...toRow(input),
      token: mintReviewRequestToken(),
      status: 'active' as ReviewRequestStatus,
      created_by: createdBy,
      expires_at: expiresAt,
    })
    .select('*')
    .single();
  if (error) throw error;
  return { request: data as ReviewRequest, reused: false };
}

/** Change what staff prefilled, before or after sending. The token stays the same. */
export async function updateReviewRequestFacts(
  id: string,
  input: ReviewRequestInput,
  supabase: SupabaseClient,
): Promise<ReviewRequest> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ ...toRow(input), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as ReviewRequest;
}

/** Record that staff copied the link. Set once, on the first copy. */
export async function markReviewRequestSent(id: string, sentBy: string | null, supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({ sent_at: new Date().toISOString(), sent_by: sentBy })
    .eq('id', id)
    .is('sent_at', null);
  if (error) throw error;
}

export type ReviewRequestRefusal = 'not_found' | 'expired' | 'cancelled';

/** Look a token up for the public page. Refusals, not throws: each is a different sentence. */
export async function getReviewRequestByToken(
  token: string,
  supabase: SupabaseClient,
): Promise<{ request: ReviewRequest } | { refusal: ReviewRequestRefusal }> {
  if (!token || typeof token !== 'string' || token.length > 100) return { refusal: 'not_found' };
  await expireOldReviewRequests(supabase);

  const { data, error } = await supabase.from(TABLE).select('*').eq('token', token).maybeSingle();
  if (error) throw error;
  if (!data) return { refusal: 'not_found' };

  const request = data as ReviewRequest;
  if (request.status === 'cancelled') return { refusal: 'cancelled' };
  if (request.status === 'expired') return { refusal: 'expired' };
  // A submitted link stays open past its time, so the student can still reach the
  // Google step; an unsubmitted one never opens once its time has passed.
  if (!request.submitted_at && new Date(request.expires_at).getTime() <= Date.now()) return { refusal: 'expired' };
  return { request };
}

/** Count a visit. Stamps opened_at once and moves active to opened. */
export async function markReviewRequestOpened(request: ReviewRequest, supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({
      opened_at: request.opened_at ?? new Date().toISOString(),
      open_count: (request.open_count || 0) + 1,
      ...(request.status === 'active' ? { status: 'opened' as ReviewRequestStatus } : {}),
    })
    .eq('id', request.id);
  // A visit counter must never be the reason a student cannot open their form.
  if (error) console.warn('[review-request] could not record an open:', error.message);
}

/**
 * Reserve one AI call for this link. Returns false once the link has used its
 * allowance, so a forwarded link cannot be used as a free transcription service.
 */
export async function reserveAiCall(request: ReviewRequest, supabase: SupabaseClient): Promise<boolean> {
  if ((request.ai_call_count || 0) >= MAX_AI_CALLS_PER_REQUEST) return false;
  const { data, error } = await supabase
    .from(TABLE)
    .update({ ai_call_count: (request.ai_call_count || 0) + 1 })
    .eq('id', request.id)
    .eq('ai_call_count', request.ai_call_count || 0)
    .select('id');
  if (error) throw error;
  return (data?.length || 0) > 0;
}

export type ReviewRequestEvent = 'google_click' | 'google_posted' | 'secondary_click';

/** What the student did after submitting. First timestamp wins. */
export async function recordReviewRequestEvent(
  request: ReviewRequest,
  event: ReviewRequestEvent,
  supabase: SupabaseClient,
): Promise<void> {
  const now = new Date().toISOString();
  const patch =
    event === 'google_click'
      ? { google_clicked_at: request.google_clicked_at ?? now }
      : event === 'google_posted'
        ? { google_posted_self_reported_at: request.google_posted_self_reported_at ?? now, google_clicked_at: request.google_clicked_at ?? now }
        : { secondary_clicked_at: request.secondary_clicked_at ?? now };
  const { error } = await supabase.from(TABLE).update(patch).eq('id', request.id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Where the student is sent after submitting
// ---------------------------------------------------------------------------

export interface ReviewTargets {
  google: GoogleTarget | null;
  secondary: { platform: ReviewSecondaryPlatform; url: string } | null;
}

/**
 * Work out the one Google profile and the one directory for this student, and
 * remember them on the row so the choice never changes between visits.
 */
export async function loadReviewTargets(request: ReviewRequest, supabase: SupabaseClient): Promise<ReviewTargets> {
  const [{ data: centres }, { data: links }] = await Promise.all([
    supabase
      .from('offline_centers')
      .select('id, name, city, center_type, google_place_id, google_reviews_url')
      .eq('is_active', true),
    supabase.from('review_platform_urls').select('center_id, platform, review_url').eq('is_active', true),
  ]);
  const all = (centres || []) as ReviewCentre[];
  const platformLinks = (links || []) as ReviewPlatformLink[];
  const centre = all.find((c) => c.id === request.center_id) || null;
  const headquarters = all.find((c) => c.center_type === 'headquarters') || null;

  const google = resolveGoogleTarget({ learningMode: request.learning_mode, centre, headquarters, links: platformLinks });

  let secondaryPlatform = request.secondary_platform;
  if (!secondaryPlatform) {
    const available = (['justdial', 'sulekha'] as ReviewSecondaryPlatform[]).filter((p) =>
      secondaryUrlFor(p, centre?.id ?? null, headquarters?.id ?? null, platformLinks),
    );
    if (available.length) {
      const { data: used } = await supabase.from(TABLE).select('secondary_platform').not('secondary_platform', 'is', null);
      const usage: Partial<Record<ReviewSecondaryPlatform, number>> = {};
      for (const r of (used || []) as Array<{ secondary_platform: ReviewSecondaryPlatform }>) {
        usage[r.secondary_platform] = (usage[r.secondary_platform] ?? 0) + 1;
      }
      secondaryPlatform = pickSecondaryPlatform(available, usage);
    }
  }
  const secondaryUrl = secondaryPlatform
    ? secondaryUrlFor(secondaryPlatform, centre?.id ?? null, headquarters?.id ?? null, platformLinks)
    : null;

  const patch: Record<string, unknown> = {};
  if (google && request.google_target_url !== google.url) patch.google_target_url = google.url;
  if (secondaryPlatform && request.secondary_platform !== secondaryPlatform) patch.secondary_platform = secondaryPlatform;
  if (Object.keys(patch).length) {
    const { error } = await supabase.from(TABLE).update(patch).eq('id', request.id);
    if (error) console.warn('[review-request] could not remember targets:', error.message);
  }

  return {
    google,
    secondary: secondaryPlatform && secondaryUrl ? { platform: secondaryPlatform, url: secondaryUrl } : null,
  };
}

// ---------------------------------------------------------------------------
// The student's review
// ---------------------------------------------------------------------------

export interface ReviewSubmission {
  text: string;
  rating: number;
  displayName: string;
  /** The student agreed to the review being shown with their name. Required. */
  consentToPublish: boolean;
  /** The student agreed to their photo being shown. */
  photoConsent: boolean;
  isMinor?: boolean;
  guardianConsent?: boolean;
  inputMode: 'typed' | 'voice';
  voiceTranscript?: string | null;
  corrections?: unknown;
}

export type SubmitRefusal = 'locked' | 'invalid' | 'no_consent';

const COURSE_NAME: Record<string, string> = {
  NATA: 'NATA Preparation',
  JEE_PAPER_2: 'JEE Paper 2 Preparation',
  BOTH: 'NATA + JEE Paper 2 Preparation',
};

/**
 * Store or update the student's review.
 *
 * The first submit inserts a learner testimonial (the trigger holds it hidden).
 * Later submits through the same link rewrite that row while it is still waiting
 * for staff; once staff have moderated it the link is locked, so a student cannot
 * change words that are already public.
 */
export async function submitReviewFromRequest(
  request: ReviewRequest,
  input: ReviewSubmission,
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<
  | { ok: true; testimonialId: string; updated: boolean }
  | { ok: false; refusal: SubmitRefusal; errors?: Record<string, string> }
> {
  if (!input.consentToPublish) return { ok: false, refusal: 'no_consent' };

  const corrections = sanitizeCorrections(input.corrections, request);
  const year = Number(corrections.exam_year ?? request.exam_year ?? now.getFullYear());
  const city = corrections.city ?? request.city ?? 'Online';
  const text = (input.text ?? '').trim();

  const check = validateLearnerTestimonial(
    {
      text,
      rating: input.rating,
      examType: request.exam_type,
      year,
      city,
      displayName: input.displayName,
      consentToPublish: true,
      isMinor: !!input.isMinor,
      guardianConsent: !!input.guardianConsent,
    },
    now,
  );
  if (!check.ok) return { ok: false, refusal: 'invalid', errors: check.errors as Record<string, string> };

  const displayName = input.displayName.trim().replace(/\s+/g, ' ').slice(0, 60);
  const airRank = corrections.air_rank ? Number(corrections.air_rank) : request.air_rank;
  const percentile = corrections.percentile ? Number(corrections.percentile) : request.percentile;
  const college = corrections.college_admitted ?? request.college_admitted;
  const transcript = input.inputMode === 'voice' ? (input.voiceTranscript ?? '').trim().slice(0, 4000) || null : null;

  const row: Record<string, unknown> = {
    user_id: request.user_id,
    source: 'learner',
    student_name: displayName,
    student_photo: input.photoConsent ? request.photo_url : null,
    content: { en: text },
    rating: input.rating,
    exam_type: request.exam_type,
    year,
    city: city.slice(0, 60),
    course_name: COURSE_NAME[request.exam_type] ?? 'NATA Preparation',
    rank: airRank ?? null,
    percentile: percentile ?? null,
    college_admitted: college ?? null,
    center_id: request.center_id,
    review_request_id: request.id,
    is_verified_student: true,
    original_text: text,
    voice_transcript: transcript,
    input_mode: input.inputMode,
    consent_given_at: now.toISOString(),
    consent_by: input.isMinor ? 'guardian' : 'self',
    consent_display_name: displayName,
  };
  if (request.learning_mode) row.learning_mode = request.learning_mode;

  let testimonialId = request.testimonial_id;
  let updated = false;

  if (testimonialId) {
    const { data: existing, error: readError } = await supabase
      .from('testimonials')
      .select('id, publication_status')
      .eq('id', testimonialId)
      .maybeSingle();
    if (readError) throw readError;
    if (existing && existing.publication_status !== 'pending_moderation') return { ok: false, refusal: 'locked' };
    if (existing) {
      const { error } = await supabase.from('testimonials').update(row).eq('id', testimonialId);
      if (error) throw error;
      updated = true;
    } else {
      testimonialId = null; // staff deleted it; start again
    }
  }

  if (!testimonialId) {
    const { data, error } = await supabase.from('testimonials').insert(row).select('id').single();
    if (error) throw error;
    testimonialId = (data as { id: string }).id;
  }

  const { error: requestError } = await supabase
    .from(TABLE)
    .update({
      status: 'submitted' as ReviewRequestStatus,
      testimonial_id: testimonialId,
      submitted_at: request.submitted_at ?? now.toISOString(),
      student_corrections: corrections,
      updated_at: now.toISOString(),
    })
    .eq('id', request.id);
  if (requestError) throw requestError;

  return { ok: true, testimonialId: testimonialId!, updated };
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export interface StaffTestimonialEdit {
  text?: string;
  rating?: number;
  displayName?: string;
  photoUrl?: string | null;
  collegeAdmitted?: string | null;
  rank?: number | null;
  percentile?: number | null;
  year?: number;
  city?: string;
}

/**
 * Staff edit what the public page shows. `original_text` is never touched, so the
 * student's own words stay on record next to whatever was published.
 */
export async function staffEditTestimonial(
  id: string,
  edit: StaffTestimonialEdit,
  adminId: string | null,
  supabase: SupabaseClient,
): Promise<void> {
  const { data: current, error: readError } = await supabase
    .from('testimonials')
    .select('id, content, source')
    .eq('id', id)
    .maybeSingle();
  if (readError) throw readError;
  if (!current) throw Object.assign(new Error('This review no longer exists.'), { status: 404 });

  const patch: Record<string, unknown> = {
    staff_edited: true,
    edited_by: adminId,
    edited_at: new Date().toISOString(),
  };
  if (edit.text !== undefined) {
    const text = edit.text.trim();
    if (text.length < 20 || text.length > 1500) {
      throw Object.assign(new Error('Keep the review between 20 and 1,500 characters.'), { status: 400 });
    }
    patch.content = { ...((current.content as Record<string, string>) || {}), en: text };
  }
  if (edit.rating !== undefined) {
    if (!Number.isInteger(edit.rating) || edit.rating < 1 || edit.rating > 5) {
      throw Object.assign(new Error('Rating is 1 to 5.'), { status: 400 });
    }
    patch.rating = edit.rating;
  }
  if (edit.displayName !== undefined) {
    const name = edit.displayName.trim().slice(0, 60);
    if (name.length < 2) throw Object.assign(new Error('Add the name to show.'), { status: 400 });
    patch.student_name = name;
    if (current.source === 'learner') patch.consent_display_name = name;
  }
  if (edit.photoUrl !== undefined) patch.student_photo = edit.photoUrl || null;
  if (edit.collegeAdmitted !== undefined) patch.college_admitted = edit.collegeAdmitted?.trim() || null;
  if (edit.rank !== undefined) patch.rank = edit.rank;
  if (edit.percentile !== undefined) patch.percentile = edit.percentile;
  if (edit.year !== undefined) patch.year = edit.year;
  if (edit.city !== undefined) patch.city = edit.city.trim().slice(0, 60);

  const { error } = await supabase.from('testimonials').update(patch).eq('id', id);
  if (error) throw error;
}

export interface ReviewRequestListRow extends ReviewRequest {
  progress: ReviewRequestProgress;
  testimonial: { publication_status: string; rating: number | null } | null;
  centre_name: string | null;
}

/** Every request for the Admin table, newest first, with the review's state. */
export async function listReviewRequests(
  options: { limit?: number } = {},
  supabase: SupabaseClient,
): Promise<ReviewRequestListRow[]> {
  await expireOldReviewRequests(supabase);
  const { data, error } = await supabase
    .from(TABLE)
    .select('*, testimonial:testimonials!review_requests_testimonial_id_fkey(publication_status, rating), centre:offline_centers(name)')
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 500);
  if (error) throw error;
  return ((data || []) as any[]).map((r) => {
    const { testimonial, centre, ...rest } = r;
    return {
      ...(rest as ReviewRequest),
      testimonial: testimonial ?? null,
      centre_name: centre?.name ?? null,
      progress: reviewRequestProgress(rest, testimonial?.publication_status),
    };
  });
}

/** The request behind a testimonial, for the moderation card. */
export async function getReviewRequestForTestimonial(
  testimonialId: string,
  supabase: SupabaseClient,
): Promise<ReviewRequest | null> {
  const { data, error } = await supabase.from(TABLE).select('*').eq('testimonial_id', testimonialId).maybeSingle();
  if (error) throw error;
  return (data as ReviewRequest) || null;
}
