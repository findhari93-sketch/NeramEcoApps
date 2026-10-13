export const dynamic = 'force-dynamic';

/**
 * PATCH /api/review-requests/[id]
 *   { action: 'mark_sent' }            staff copied or sent the link
 *   { action: 'cancel' }               kill the link
 *   { action: 'regenerate' }           new link, old one cancelled first
 *   { action: 'update', ...facts }     change what was prefilled (same link)
 *   { action: 'mark_reminded' }        staff sent the one follow-up about Google or the directory
 *
 * Staff only (admin API middleware).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import {
  cancelReviewRequest,
  createReviewRequest,
  markReviewRequestSent,
  sanitizeReviewRequestInput,
  updateReviewRequestFacts,
} from '@neram/database/queries';
import type { ReviewRequest } from '@neram/database';
import { getRequestAdminId } from '@/lib/request-admin';
import { reviewRequestMessage, reviewRequestUrl } from '@/lib/marketing-links';
import { greetingName } from '@/lib/review-requests-view';

const NO_STORE = { 'Cache-Control': 'no-store' };

function toInput(row: ReviewRequest) {
  return {
    userId: row.user_id,
    studentResultId: row.student_result_id,
    studentName: row.student_name,
    photoUrl: row.photo_url,
    examType: row.exam_type,
    examYear: row.exam_year,
    airRank: row.air_rank,
    percentile: row.percentile,
    score: row.score,
    collegeAdmitted: row.college_admitted,
    centerId: row.center_id,
    city: row.city,
    learningMode: row.learning_mode,
    phone: row.phone,
  };
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const adminId = getRequestAdminId(request);
  const body = await request.json().catch(() => ({}));
  const supabase = getSupabaseAdminClient() as any;

  try {
    const { data: row, error } = await supabase.from('review_requests').select('*').eq('id', params.id).maybeSingle();
    if (error) throw error;
    if (!row) return NextResponse.json({ error: 'This review link no longer exists.' }, { status: 404, headers: NO_STORE });
    const current = row as ReviewRequest;

    switch (body?.action) {
      case 'mark_sent':
        await markReviewRequestSent(current.id, adminId, supabase);
        return NextResponse.json({ ok: true }, { headers: NO_STORE });

      case 'mark_reminded': {
        const { error: remindError } = await supabase
          .from('review_requests')
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq('id', current.id)
          .is('reminder_sent_at', null);
        if (remindError) throw remindError;
        return NextResponse.json({ ok: true }, { headers: NO_STORE });
      }

      case 'cancel':
        await cancelReviewRequest(current.id, adminId, supabase);
        return NextResponse.json({ ok: true }, { headers: NO_STORE });

      case 'regenerate': {
        if (current.submitted_at) {
          return NextResponse.json({ error: 'The student already sent a review with this link.' }, { status: 409, headers: NO_STORE });
        }
        // Unknown students have no partial unique index to trip, but cancel first anyway.
        await cancelReviewRequest(current.id, adminId, supabase);
        const { request: fresh } = await createReviewRequest(toInput(current), adminId, supabase, { regenerate: true });
        const url = reviewRequestUrl(fresh.token, { adminOrigin: request.nextUrl.origin, configured: process.env.NEXT_PUBLIC_MARKETING_URL });
        return NextResponse.json(
          { ok: true, id: fresh.id, url, message: reviewRequestMessage(greetingName(fresh.student_name), url, fresh.college_admitted) },
          { headers: NO_STORE },
        );
      }

      case 'update': {
        const checked = sanitizeReviewRequestInput({ ...toInputForSanitize(current), ...(body.facts || {}) });
        if (!checked.ok) return NextResponse.json({ error: 'Please fix the highlighted fields.', fieldErrors: checked.errors }, { status: 400, headers: NO_STORE });
        const updated = await updateReviewRequestFacts(current.id, checked.value, supabase);
        return NextResponse.json({ ok: true, request: updated }, { headers: NO_STORE });
      }

      default:
        return NextResponse.json({ error: 'Unknown action.' }, { status: 400, headers: NO_STORE });
    }
  } catch (error: any) {
    console.error('[review-requests] patch', error?.message || error);
    return NextResponse.json({ error: 'Could not update the review link.' }, { status: 500, headers: NO_STORE });
  }
}

/** The stored row in the camelCase shape sanitizeReviewRequestInput reads. */
function toInputForSanitize(row: ReviewRequest): Record<string, unknown> {
  return toInput(row) as unknown as Record<string, unknown>;
}
