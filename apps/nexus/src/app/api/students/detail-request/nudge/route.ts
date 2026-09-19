import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { createOrReuseDetailRequest } from '@neram/database/queries';
import { getRequestUser, assertCapability } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';
import { sendNudge } from '@/lib/nudge-delivery';
import { studentDetailUrl } from '@/lib/marketing-links';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/students/detail-request/nudge
 * Body: { classroomId, studentId }
 *
 * Asks the student for their details through Teams and the Nexus bell, as well as
 * by link.
 *
 * WHY BOTH. A student who already uses Nexus gets the message where they are and a
 * form they can fill in without leaving the app. A student who has never signed in
 * cannot be reached this way at all, and still needs the WhatsApp link. Of the 28
 * enrolled students with no form, 7 have ever opened Nexus, so neither channel on
 * its own covers the group. The reply says which one actually landed rather than
 * claiming a delivery nobody can verify.
 *
 * Everything goes through sendNudge, which is the only door to a student
 * (lib/notification-door-guard.test.ts fails a direct user_notifications write). The
 * Teams chat is sent as the teacher who pressed the button.
 *
 * reachNotStarted is true because these students are dormant almost by definition:
 * never having signed in is what put them in this list. That is exactly the case the
 * flag exists for, alongside the join reminders. Students PAUSED by staff are still
 * dropped, which is the behaviour we want.
 */
export async function POST(request: NextRequest) {
  try {
    const staff = await getRequestUser(request.headers.get('Authorization'));
    assertCapability(staff, 'coord.nudge');

    const body = await request.json().catch(() => ({}));
    const { classroomId, studentId } = (body ?? {}) as Record<string, unknown>;
    if (![classroomId, studentId].every((value) => typeof value === 'string' && UUID.test(value))) {
      return NextResponse.json({ error: 'classroomId and studentId are required.' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;

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
    if (enrollment.user?.is_alumni) {
      return NextResponse.json(
        { error: 'That student has already graduated, so there is nothing to collect.' },
        { status: 409 },
      );
    }

    // The same link the WhatsApp message carries, so a student who opens the Teams
    // message on a laptop where they are not signed into Nexus still has a way in.
    const { request: detailRequest } = await createOrReuseDetailRequest(
      { userId: studentId as string, createdBy: staff.id },
      supabase,
    );
    const url = studentDetailUrl(detailRequest.token, {
      nexusOrigin: request.nextUrl.origin,
      configured: process.env.NEXT_PUBLIC_MARKETING_URL ?? null,
    });

    const subject = 'Please fill in your details';
    const plain =
      'Hi {firstName}, Neram Classes needs a few details for your student record: ' +
      'your class, the year you write the exam, and where you live. It takes about a minute.';

    const { counts } = await sendNudge({
      studentIds: [studentId as string],
      subject,
      plain,
      eventType: 'application_details_needed',
      // The bell row carries the in-app destination. NotificationBell reads
      // metadata.href for this event type, which is the generic deep-link pattern
      // already used by catchup_overdue and prework_reason_needed.
      metadata: { href: '/student/complete-profile', source: 'application_forms' },
      teacher: { authHeader: request.headers.get('Authorization'), userId: staff.id },
      sendAs: { senderUserId: staff.id, link: { url, label: 'Fill in your details' } },
      // Never having signed in is what put them on this list, so the whole point is
      // reaching exactly those students.
      reachNotStarted: true,
      source: { kind: 'application_details', refId: classroomId as string },
    });

    // Say what actually happened. A teacher who is told "sent" when nothing landed
    // will not follow up, and this group is the one most likely to be unreachable.
    const landed = counts.chat + counts.teams;
    const summary = landed
      ? 'Sent in Teams, and it is in their Nexus notifications.'
      : counts.inapp
        ? 'No Teams account to message, so it is waiting in their Nexus notifications. Send the link as well.'
        : 'Could not reach them. Send the link instead.';

    return NextResponse.json({ summary, counts, url });
  } catch (err) {
    return errorResponse(err, 'Failed to send that');
  }
}
