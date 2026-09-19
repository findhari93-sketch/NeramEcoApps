import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import {
  cancelDetailRequest,
  createOrReuseDetailRequest,
  getLiveDetailRequestForUser,
  markDetailRequestSent,
} from '@neram/database/queries';
import { getRequestUser, assertCapability } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';
import { studentDetailUrl } from '@/lib/marketing-links';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/students/detail-request
 * Body: { classroomId, studentId, regenerate?: boolean }
 *
 * Makes (or reuses) the link a student opens to fill in their own application
 * details, and returns it for staff to send.
 *
 * CAPABILITY. This is `coord.nudge`, not `structure.student.account`. Asking a
 * student for their details is the same kind of act as any other nudge, and
 * coord.nudge is in SHARED_STAFF so every teacher holds it. The linking and merging
 * routes next door keep structure.student.account, because deciding which records
 * belong to the same person is a different and heavier judgement. Gating this one
 * the same way would have hidden it from the very people who open the sheet.
 *
 * Reuse over re-minting is the default: a teacher who presses the button twice must
 * not invalidate the link they already sent. `regenerate: true` is the deliberate
 * "that link is broken, give me another" path, and it cancels the old row first.
 */
export async function POST(request: NextRequest) {
  try {
    const staff = await getRequestUser(request.headers.get('Authorization'));
    assertCapability(staff, 'coord.nudge');

    const body = await request.json().catch(() => ({}));
    const { classroomId, studentId, regenerate } = (body ?? {}) as Record<string, unknown>;
    if (![classroomId, studentId].every((value) => typeof value === 'string' && UUID.test(value))) {
      return NextResponse.json({ error: 'classroomId and studentId are required.' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;

    // The student must really be in this classroom, and must really be a student.
    // Checked server side because the caller sends both ids.
    const { data: enrollment, error: enrollmentError } = await supabase
      .from('nexus_enrollments')
      .select('id, user:users!inner(id, is_alumni)')
      .eq('classroom_id', classroomId)
      .eq('user_id', studentId)
      .eq('role', 'student')
      .eq('is_active', true)
      .maybeSingle();
    if (enrollmentError) throw enrollmentError;
    if (!enrollment) {
      return NextResponse.json({ error: 'That student is not in this classroom.' }, { status: 404 });
    }
    // Alumni are deliberately out of scope: chasing an application form from someone
    // who has already finished the course is not a thing anyone wants to do.
    if (enrollment.user?.is_alumni) {
      return NextResponse.json(
        { error: 'That student has already graduated, so there is nothing to collect.' },
        { status: 409 },
      );
    }

    const { request: detailRequest, reused } = await createOrReuseDetailRequest(
      { userId: studentId as string, createdBy: staff.id, regenerate: regenerate === true },
      supabase,
    );

    // Copying the link is the closest thing to proof that it was sent, because the
    // sending itself happens by hand in WhatsApp where no app can see it.
    await markDetailRequestSent(detailRequest.id, staff.id, supabase);

    return NextResponse.json({
      url: studentDetailUrl(detailRequest.token, {
        nexusOrigin: request.nextUrl.origin,
        configured: process.env.NEXT_PUBLIC_MARKETING_URL ?? null,
      }),
      expiresAt: detailRequest.expires_at,
      reused,
    });
  } catch (err) {
    return errorResponse(err, 'Failed to make a link');
  }
}

/**
 * DELETE /api/students/detail-request?studentId=...
 * Withdraws the live link. After this the token opens nothing, which is the reason
 * the token is a database row rather than something signed and stateless.
 */
export async function DELETE(request: NextRequest) {
  try {
    const staff = await getRequestUser(request.headers.get('Authorization'));
    assertCapability(staff, 'coord.nudge');

    const studentId = request.nextUrl.searchParams.get('studentId') || '';
    if (!UUID.test(studentId)) {
      return NextResponse.json({ error: 'studentId is required.' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;
    const live = await getLiveDetailRequestForUser(studentId, supabase);
    if (live) await cancelDetailRequest(live.id, staff.id, supabase);

    return NextResponse.json({ cancelled: Boolean(live) });
  } catch (err) {
    return errorResponse(err, 'Failed to withdraw that link');
  }
}
