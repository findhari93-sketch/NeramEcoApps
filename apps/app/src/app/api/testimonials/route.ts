export const dynamic = 'force-dynamic';

/**
 * Learner testimonials (lifecycle plan M6)
 *
 * GET  /api/testimonials  What the review form needs: whether the signed-in
 *                         learner counts as under 18, a suggested display name,
 *                         and when they may send their next review.
 * POST /api/testimonials  Store a review. It always lands hidden, waiting for
 *                         staff review. One learner review per 30 days.
 *
 * Under 18 is derived here from users.date_of_birth (unknown counts as under
 * 18). Anything the client says about age is ignored.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import {
  getSupabaseAdminClient,
  getUserByFirebaseUid,
  insertFunnelEvent,
  submitLearnerTestimonial,
  validateLearnerTestimonial,
} from '@neram/database';
import type { LearnerTestimonialInput, TestimonialExam, UserFunnelEventInsert } from '@neram/database';
import {
  formatReviewDate,
  isMinorFromDob,
  nextTestimonialAllowedAt,
  suggestDisplayName,
  TESTIMONIAL_COOLDOWN_DAYS,
} from '@/lib/learner-feedback';

type ResolvedUser = NonNullable<Awaited<ReturnType<typeof getUserByFirebaseUid>>>;

async function resolveUser(req: NextRequest): Promise<{ user: ResolvedUser } | { response: NextResponse }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { response: NextResponse.json({ error: 'Please sign in to share a review.' }, { status: 401 }) };
  }
  let uid: string;
  try {
    const decoded = await verifyIdToken(authHeader.slice('Bearer '.length).trim());
    uid = decoded.uid;
  } catch {
    return { response: NextResponse.json({ error: 'Your session has expired. Please sign in again.' }, { status: 401 }) };
  }
  const user = await getUserByFirebaseUid(uid, getSupabaseAdminClient());
  if (!user) {
    return { response: NextResponse.json({ error: 'We could not find your account. Please sign in again.' }, { status: 401 }) };
  }
  return { user };
}

/** The learner's most recent review, if any (any status). */
async function lastLearnerSubmission(userId: string): Promise<string | null> {
  // testimonials.user_id and source are newer than the generated Database type.
  const supabase = getSupabaseAdminClient() as any;
  const { data, error } = await supabase
    .from('testimonials')
    .select('created_at')
    .eq('user_id', userId)
    .eq('source', 'learner')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0]?.created_at ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveUser(req);
    if ('response' in auth) return auth.response;
    const { user } = auth;
    const last = await lastLearnerSubmission(user.id);
    const next = nextTestimonialAllowedAt(last);
    return NextResponse.json({
      isMinor: isMinorFromDob(user.date_of_birth),
      suggestedDisplayName: suggestDisplayName(user),
      lastSubmittedAt: last,
      nextAllowedAt: next ? next.toISOString() : null,
    });
  } catch (error) {
    console.error('[testimonials] GET failed:', error);
    return NextResponse.json({ error: 'Could not load the review form. Please try again.' }, { status: 500 });
  }
}

function readBody(body: Record<string, unknown>, isMinor: boolean): LearnerTestimonialInput {
  const consentToPublish = body.consentToPublish === true;
  return {
    text: typeof body.text === 'string' ? body.text : '',
    rating: Number(body.rating),
    examType: body.examType as TestimonialExam,
    year: Number(body.year),
    city: typeof body.city === 'string' ? body.city : '',
    displayName: consentToPublish && typeof body.displayName === 'string' ? body.displayName : '',
    consentToPublish,
    guardianConsent: isMinor && body.guardianConsent === true,
    // Never from the client.
    isMinor,
  };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await resolveUser(req);
    if ('response' in auth) return auth.response;
    const { user } = auth;

    const raw = await req.json().catch(() => null);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return NextResponse.json({ error: 'Please fill in the review form.' }, { status: 400 });
    }

    const isMinor = isMinorFromDob(user.date_of_birth);
    const input = readBody(raw as Record<string, unknown>, isMinor);
    const check = validateLearnerTestimonial(input);
    if (!check.ok) {
      return NextResponse.json({ error: 'Please check the highlighted fields.', fieldErrors: check.errors }, { status: 400 });
    }

    const next = nextTestimonialAllowedAt(await lastLearnerSubmission(user.id));
    if (next) {
      return NextResponse.json(
        {
          error: `Thanks, we already have a review from you. You can share another one from ${formatReviewDate(next)}.`,
          nextAllowedAt: next.toISOString(),
          cooldownDays: TESTIMONIAL_COOLDOWN_DAYS,
        },
        { status: 429 },
      );
    }

    let saved: { id: string };
    try {
      saved = await submitLearnerTestimonial(user.id, input, getSupabaseAdminClient());
    } catch (err) {
      const fieldErrors = (err as { fieldErrors?: unknown })?.fieldErrors;
      if (fieldErrors) {
        return NextResponse.json({ error: 'Please check the highlighted fields.', fieldErrors }, { status: 400 });
      }
      throw err;
    }

    // Best effort: the review is saved whether or not the event lands.
    try {
      const event: UserFunnelEventInsert = {
        user_id: user.id,
        anonymous_id: null,
        session_id: null,
        funnel: 'feedback',
        event: 'feedback_submitted',
        status: 'completed',
        error_message: null,
        error_code: null,
        metadata: { kind: 'testimonial', consent: input.consentToPublish, testimonial_id: saved.id },
        device_session_id: null,
        device_type: null,
        browser: null,
        os: null,
        ip_address: null,
        source_app: 'app',
        page_url: '/review',
      };
      await insertFunnelEvent(getSupabaseAdminClient(), event);
    } catch (eventError) {
      console.warn('[testimonials] feedback_submitted event not recorded:', eventError);
    }

    return NextResponse.json({ id: saved.id, status: 'pending_moderation' }, { status: 201 });
  } catch (error) {
    console.error('[testimonials] POST failed:', error);
    return NextResponse.json({ error: 'We could not save your review. Please try again.' }, { status: 500 });
  }
}
