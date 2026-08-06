import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { errorResponse } from '@/lib/api-errors';
import {
  getSupabaseAdminClient,
  getClassTest,
  getClassTestRoster,
  recordClassTestReminder,
  countClassTestReminders,
} from '@neram/database';
import { resolveClassStaffAccess } from '@/lib/class-staff-access';
import { sendNudge, plainToHtml } from '@/lib/nudge-delivery';

/**
 * POST /api/timetable/[classId]/class-test/nudge   (staff)
 * Body: { student_ids?: string[] }  — omit to chase everyone who still owes it.
 *
 * Reuses sendNudge so a class test reaches a student through exactly the same
 * three tiers as an assignment reminder (Teams activity feed, in-app bell, email
 * backstop), and writes one nexus_class_test_reminders row per recipient so a
 * second teacher can see who has already been chased.
 *
 * It sends NOTHING to any parent, ever. Same contract as the prework sweep: a
 * machine may draft a list, a person decides to message a family.
 */

interface Ctx {
  params: { classId: string };
}

const TEMPLATE = 'class_test_manual';

interface NudgeClass {
  id: string;
  classroom_id: string;
  teacher_id: string | null;
  title: string | null;
  scheduled_date: string;
}

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json().catch(() => ({}) as any);
    const supabase = getSupabaseAdminClient() as any;

    const acc = await resolveClassStaffAccess<NudgeClass>(
      supabase,
      msUser.oid,
      params.classId,
      'id, classroom_id, teacher_id, title, scheduled_date',
    );
    if ('error' in acc) return acc.error;
    if (!acc.canEdit) {
      return NextResponse.json({ error: 'Only staff can send this reminder' }, { status: 403 });
    }

    const classTest = await getClassTest(params.classId, supabase);
    if (!classTest) {
      return NextResponse.json({ error: 'No test is set on this class.' }, { status: 404 });
    }

    // The roster, so an explicit id list still cannot reach someone outside this
    // classroom. A staff-only route is still not a reason to trust an id.
    const { data: enrolments } = await supabase
      .from('nexus_enrollments')
      .select('user_id')
      .eq('classroom_id', acc.cls.classroom_id)
      .eq('role', 'student')
      .eq('is_active', true);
    const enrolled = new Set(((enrolments || []) as any[]).map((e) => e.user_id as string));

    const requested: string[] | null = Array.isArray(body?.student_ids)
      ? body.student_ids.filter((x: unknown) => typeof x === 'string')
      : null;

    const standing = await getClassTestRoster(params.classId, [...enrolled], supabase);

    // Default to everyone who still owes it. Passing an explicit list narrows
    // that; it never widens it, and it never reaches someone who has passed.
    const targets = [...enrolled].filter((id) => {
      if (requested && !requested.includes(id)) return false;
      return !standing.get(id)?.passed_at;
    });

    if (targets.length === 0) {
      return NextResponse.json({ error: 'Everyone has already passed this test.' }, { status: 400 });
    }

    const due = classTest.due_at
      ? new Date(classTest.due_at).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          timeZone: 'Asia/Kolkata',
        })
      : null;

    const plain =
      `${classTest.title} is still outstanding from ${acc.cls.title || 'your class'}.` +
      (due ? `\n\nIt was due by ${due}.` : '') +
      `\n\n${classTest.question_count} question${classTest.question_count === 1 ? '' : 's'}, ` +
      `pass at ${classTest.must_get_right} of ${classTest.question_count}. ` +
      'You can retry it as many times as you need.';

    const { results, counts } = await sendNudge({
      studentIds: targets,
      subject: `Test to finish: ${classTest.title}`,
      plain,
      html: plainToHtml(plain),
      teamsText: 'A test from your class is still outstanding',
      eventType: 'class_test_due',
      metadata: {
        class_id: params.classId,
        test_id: classTest.test_id,
        placement_id: classTest.placement_id,
      },
    });

    // Logged per recipient so a second teacher can see who was already chased.
    // Sequential rather than Promise.all: a reminder log is not worth opening a
    // connection per student on a roster that can be thirty deep.
    for (const r of results) {
      await recordClassTestReminder(
        {
          placement_id: classTest.placement_id,
          student_id: r.studentId,
          sent_by: acc.userId,
          channel: r.channel,
          template: TEMPLATE,
        },
        supabase,
      );
    }

    const reminderCounts = await countClassTestReminders(classTest.placement_id, supabase);

    return NextResponse.json({
      results,
      counts,
      reminder_counts: Object.fromEntries(reminderCounts),
    });
  } catch (err) {
    return errorResponse(err, 'Failed to send the reminder');
  }
}
