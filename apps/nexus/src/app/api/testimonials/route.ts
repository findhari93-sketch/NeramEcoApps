import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  submitLearnerTestimonial,
  validateLearnerTestimonial,
  type LearnerTestimonialInput,
} from '@neram/database';
import { ApiError, describeError, errorResponse, throwIfReadFailed } from '@/lib/api-errors';
import { verifyMsToken } from '@/lib/ms-verify';
import { getRequestUser, type RequestUser } from '@/lib/study-materials';
import { formatDateIN } from '@/lib/student-profile-fields';
import { TESTIMONIAL_COOLDOWN_DAYS, isMinorOn, nextTestimonialAllowedAt } from '@/lib/lifecycle-display';

/**
 * /api/testimonials: a student tells Neram about their experience (lifecycle
 * plan M6). Separate from review campaigns, which ask for Google reviews.
 *
 *   GET   what the form needs: whether the student counts as under 18, and
 *         when they may write again.
 *   POST  store the testimonial. It always lands hidden, waiting for staff
 *         review (submitLearnerTestimonial and the testimonials trigger).
 *
 * The server decides whether the student is a minor, from users.date_of_birth,
 * and an unknown date counts as a minor. The client's view of that is never
 * trusted, because it decides whether a guardian's consent is required before
 * publication can count.
 *
 * One submission per student per TESTIMONIAL_COOLDOWN_DAYS days.
 */

async function requireStudent(request: NextRequest): Promise<RequestUser> {
  const auth = request.headers.get('Authorization');
  const ms = await verifyMsToken(auth);
  // A teacher using View as Student must not write in the student's name.
  if (ms.impersonatorUserId) {
    throw new ApiError('Only the student can share their own experience.', 403);
  }
  const user = await getRequestUser(auth);
  if (user.user_type !== 'student') {
    throw new ApiError('Only students can share an experience here.', 403);
  }
  return user;
}

async function readStudentContext(userId: string, now: Date) {
  const supabase = getSupabaseAdminClient();
  const [userResult, lastResult] = await Promise.all([
    supabase.from('users').select('date_of_birth').eq('id', userId).maybeSingle(),
    supabase
      .from('testimonials')
      .select('submitted_at, created_at')
      .eq('user_id', userId)
      .eq('source', 'learner')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  throwIfReadFailed(userResult.error, 'your profile');
  throwIfReadFailed(lastResult.error, 'your earlier reviews');

  const last = (lastResult.data as { submitted_at?: string | null; created_at?: string | null } | null) ?? null;
  const lastSubmittedAt = last ? last.submitted_at ?? last.created_at ?? null : null;
  return {
    isMinor: isMinorOn((userResult.data as { date_of_birth?: string | null } | null)?.date_of_birth ?? null, now),
    lastSubmittedAt,
    nextAllowedAt: nextTestimonialAllowedAt(lastSubmittedAt, now),
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireStudent(request);
    const ctx = await readStudentContext(user.id, new Date());
    return NextResponse.json(ctx, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    return errorResponse(err, 'Could not load the review form');
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireStudent(request);
    const now = new Date();
    const ctx = await readStudentContext(user.id, now);

    if (ctx.nextAllowedAt) {
      return NextResponse.json(
        {
          error: `Thank you, you already shared your experience in the last ${TESTIMONIAL_COOLDOWN_DAYS} days. You can write again from ${formatDateIN(ctx.nextAllowedAt)}.`,
          nextAllowedAt: ctx.nextAllowedAt,
        },
        { status: 429 },
      );
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Send the form as JSON.' }, { status: 400 });
    }

    const input: LearnerTestimonialInput = {
      text: typeof body.text === 'string' ? body.text : '',
      rating: Number(body.rating),
      examType: body.examType as LearnerTestimonialInput['examType'],
      year: Number(body.year),
      city: typeof body.city === 'string' ? body.city : '',
      displayName: typeof body.displayName === 'string' ? body.displayName : '',
      consentToPublish: body.consentToPublish === true,
      guardianConsent: body.guardianConsent === true,
      // Server-derived. Whatever the client sent for this is ignored.
      isMinor: ctx.isMinor,
    };

    const check = validateLearnerTestimonial(input, now);
    if (!check.ok) {
      return NextResponse.json(
        { error: 'Some answers need another look.', fieldErrors: check.errors },
        { status: 400 },
      );
    }

    try {
      const { id } = await submitLearnerTestimonial(user.id, input);
      return NextResponse.json(
        { id, status: 'pending_moderation', nextAllowedAt: nextTestimonialAllowedAt(now.toISOString(), now) },
        { status: 201 },
      );
    } catch (err) {
      const fieldErrors = (err as { fieldErrors?: Record<string, string> })?.fieldErrors;
      if (fieldErrors) {
        return NextResponse.json({ error: 'Some answers need another look.', fieldErrors }, { status: 400 });
      }
      console.error(`[testimonials] insert failed: ${describeError(err)}`);
      throw new ApiError('Could not save your review. Try again in a moment.', 503);
    }
  } catch (err) {
    return errorResponse(err, 'Could not save your review');
  }
}
