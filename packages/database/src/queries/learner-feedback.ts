// @ts-nocheck - testimonial consent columns are newer than the generated Database type
/**
 * Learner testimonials with consent, moderation and the public rating
 * (lifecycle plan M6). Private feedback stays in app_feedback.
 *
 * Nothing a learner writes is public until they (or a guardian) consented and a
 * staff member published it. The database enforces the consent rule and keeps
 * testimonials.is_active (what every public page reads) in step.
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../client';

export type PublicationStatus = 'private' | 'pending_moderation' | 'approved' | 'published' | 'rejected' | 'withdrawn';
export type ConsentBy = 'self' | 'guardian' | 'staff_recorded';
export type ModerationAction = 'approve' | 'publish' | 'reject' | 'withdraw';

export const PUBLICATION_STATUS_LABELS: Record<PublicationStatus, string> = {
  private: 'Private',
  pending_moderation: 'Waiting for review',
  approved: 'Approved, not yet public',
  published: 'Public',
  rejected: 'Not published',
  withdrawn: 'Taken down',
};

export const EXAM_TYPES = ['NATA', 'JEE_PAPER_2', 'BOTH'] as const;
export type TestimonialExam = (typeof EXAM_TYPES)[number];

export interface LearnerTestimonialInput {
  text: string;
  rating: number;
  examType: TestimonialExam;
  year: number;
  city: string;
  /** Name to show if published, e.g. "Priya S." */
  displayName: string;
  /** The learner agreed to publication. */
  consentToPublish: boolean;
  /** Under 18: a parent or guardian agreed. */
  guardianConsent?: boolean;
  isMinor?: boolean;
}

export interface ValidationResult {
  ok: boolean;
  errors: Partial<Record<keyof LearnerTestimonialInput, string>>;
}

/** Pure: shared by the forms (client) and the routes (server). */
export function validateLearnerTestimonial(input: Partial<LearnerTestimonialInput>, now: Date = new Date()): ValidationResult {
  const errors: ValidationResult['errors'] = {};
  const text = (input.text ?? '').trim();
  if (text.length < 20) errors.text = 'Write at least a couple of sentences (20 characters).';
  if (text.length > 1500) errors.text = 'Keep it under 1,500 characters.';
  if (!Number.isInteger(input.rating) || (input.rating as number) < 1 || (input.rating as number) > 5) {
    errors.rating = 'Choose a rating from 1 to 5.';
  }
  if (!input.examType || !EXAM_TYPES.includes(input.examType)) errors.examType = 'Choose the exam you prepared for.';
  const y = now.getFullYear();
  if (!Number.isInteger(input.year) || (input.year as number) < 2015 || (input.year as number) > y + 2) {
    errors.year = 'Choose your exam year.';
  }
  if (!(input.city ?? '').trim()) errors.city = 'Add your city.';
  if (input.consentToPublish) {
    if ((input.displayName ?? '').trim().length < 2) errors.displayName = 'Add the name to show next to your review.';
    if (input.isMinor && !input.guardianConsent) {
      errors.guardianConsent = 'A parent or guardian must agree before a review from someone under 18 is shown publicly.';
    }
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

/** Store a learner's testimonial. Always lands hidden, waiting for review. */
export async function submitLearnerTestimonial(
  userId: string,
  input: LearnerTestimonialInput,
  client?: TypedSupabaseClient,
): Promise<{ id: string }> {
  const check = validateLearnerTestimonial(input);
  if (!check.ok) throw Object.assign(new Error('Invalid testimonial'), { fieldErrors: check.errors });

  const supabase = client || getSupabaseAdminClient();
  const consent = input.consentToPublish
    ? {
        consent_given_at: new Date().toISOString(),
        consent_by: input.isMinor ? 'guardian' : 'self',
        consent_display_name: input.displayName.trim().slice(0, 60),
      }
    : { consent_given_at: null, consent_by: null, consent_display_name: null };

  const { data, error } = await supabase
    .from('testimonials')
    .insert({
      user_id: userId,
      source: 'learner',
      student_name: (input.consentToPublish ? input.displayName : 'Learner').trim().slice(0, 60),
      content: { en: input.text.trim() },
      rating: input.rating,
      exam_type: input.examType,
      year: input.year,
      city: input.city.trim().slice(0, 60),
      course_name: input.examType === 'JEE_PAPER_2' ? 'JEE Paper 2 Preparation' : 'NATA Preparation',
      ...consent,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

/** The moderation queue and history. */
export async function listTestimonialsForModeration(
  options: { status?: PublicationStatus | 'all'; source?: 'learner' | 'staff' | 'all'; limit?: number } = {},
  client?: TypedSupabaseClient,
) {
  const supabase = client || getSupabaseAdminClient();
  const { status = 'pending_moderation', source = 'all', limit = 100 } = options;
  let query = supabase
    .from('testimonials')
    .select('id, user_id, student_name, content, rating, exam_type, year, city, source, publication_status, consent_given_at, consent_by, consent_display_name, submitted_at, moderated_by, moderated_at, moderation_note, created_at, is_featured')
    .order('submitted_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (status !== 'all') query = query.eq('publication_status', status);
  if (source !== 'all') query = query.eq('source', source);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function countPendingTestimonials(client?: TypedSupabaseClient): Promise<number> {
  const supabase = client || getSupabaseAdminClient();
  const { count, error } = await supabase
    .from('testimonials')
    .select('id', { count: 'exact', head: true })
    .eq('publication_status', 'pending_moderation');
  if (error) return 0;
  return count ?? 0;
}

const NEXT_STATUS: Record<ModerationAction, PublicationStatus> = {
  approve: 'approved',
  publish: 'published',
  reject: 'rejected',
  withdraw: 'withdrawn',
};

/**
 * Move a testimonial through moderation. Publishing a learner's words without a
 * consent on record is refused here with a clear message (the database refuses
 * it too).
 */
export async function moderateTestimonial(
  testimonialId: string,
  action: ModerationAction,
  adminId: string,
  note?: string | null,
  client?: TypedSupabaseClient,
): Promise<{ publication_status: PublicationStatus }> {
  const supabase = client || getSupabaseAdminClient();
  const { data: row, error: readError } = await supabase
    .from('testimonials')
    .select('id, source, consent_given_at, publication_status')
    .eq('id', testimonialId)
    .maybeSingle();
  if (readError) throw readError;
  if (!row) throw Object.assign(new Error('This testimonial no longer exists.'), { status: 404 });
  if (action === 'publish' && row.source === 'learner' && !row.consent_given_at) {
    throw Object.assign(new Error('The learner did not agree to publication, so this can only stay private.'), { status: 409 });
  }
  if (action === 'reject' && !(note ?? '').trim()) {
    throw Object.assign(new Error('Add a short reason for not publishing.'), { status: 400 });
  }
  const next = NEXT_STATUS[action];
  const { error } = await supabase
    .from('testimonials')
    .update({
      publication_status: next,
      moderated_by: adminId,
      moderated_at: new Date().toISOString(),
      moderation_note: note ? note.slice(0, 500) : null,
    })
    .eq('id', testimonialId);
  if (error) throw error;
  return { publication_status: next };
}

export interface ReviewStats {
  scope: string;
  review_count: number;
  rating_count: number;
  average_rating: number | null;
}

/** The public rating from published data. Empty when the function is missing. */
export async function getPublicReviewStats(client?: TypedSupabaseClient): Promise<ReviewStats[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase.rpc('public_review_stats');
  if (error) return [];
  return (data || []).map((r: any) => ({ ...r, average_rating: r.average_rating == null ? null : Number(r.average_rating) }));
}

/** Published, staff-confirmed reviews for the public pages. Only the fields a page may show. */
export async function getPublishedReviews(
  options: { exam?: 'nata' | 'jee' | 'all'; limit?: number; offset?: number } = {},
  client?: TypedSupabaseClient,
) {
  const supabase = client || getSupabaseAdminClient();
  const { exam = 'all', limit = 24, offset = 0 } = options;
  let query = supabase
    .from('testimonials')
    .select('id, student_name, consent_display_name, student_photo, content, rating, exam_type, year, city, college_admitted, course_name, source, is_featured, created_at', { count: 'exact' })
    .eq('publication_status', 'published')
    // Only testimonials a person confirmed in moderation. Rows that predate the
    // workflow stay off the review pages until staff confirm them.
    .not('moderated_at', 'is', null)
    .order('is_featured', { ascending: false })
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (exam === 'nata') query = query.in('exam_type', ['NATA', 'BOTH']);
  if (exam === 'jee') query = query.in('exam_type', ['JEE_PAPER_2', 'BOTH']);
  const { data, error, count } = await query;
  if (error) throw error;
  return {
    reviews: (data || []).map((r) => ({
      ...r,
      // Learners chose how they appear; staff rows keep their stored name.
      display_name: r.consent_display_name || r.student_name,
    })),
    total: count ?? 0,
  };
}

/** Staff-verified outcomes for one person, or for the public stories page. */
export async function listLearnerOutcomes(
  options: { userId?: string; publicOnly?: boolean; limit?: number } = {},
  client?: TypedSupabaseClient,
) {
  const supabase = client || getSupabaseAdminClient();
  let query = supabase.from('learner_outcomes_view').select('*').order('exam_year', { ascending: false }).limit(options.limit ?? 50);
  if (options.userId) query = query.eq('user_id', options.userId);
  if (options.publicOnly) query = query.eq('is_public', true);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}
