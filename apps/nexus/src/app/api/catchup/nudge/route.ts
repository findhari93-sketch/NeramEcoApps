import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, markJourneyNudged } from '@neram/database';
import { canUser } from '@/lib/staff-capabilities';
import { sendNudge, plainToHtml } from '@/lib/nudge-delivery';

/**
 * POST /api/catchup/nudge  (staff)
 * body { studentIds: string[], message?: string, journeyIds?: string[] }
 *
 * A teacher chasing someone who has stalled on their catch-up list.
 *
 * Its own route rather than a reuse of the assignment nudge: that one stamps
 * `assignment_nudge` and writes a nexus_assignment_reminders row per assignment,
 * which would file this under work it has nothing to do with. Same delivery
 * path, same wording as the weekly cron, honest event type.
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: staff } = await supabase
      .from('users')
      .select('id, user_type, staff_role, can_teach')
      .eq('ms_oid', msUser.oid)
      .maybeSingle();
    if (!staff || !canUser(staff, 'coord.nudge')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const studentIds: string[] = Array.isArray(body?.studentIds)
      ? body.studentIds.filter((x: any) => typeof x === 'string')
      : [];
    if (studentIds.length === 0) {
      return NextResponse.json({ error: 'No recipients selected' }, { status: 400 });
    }

    const text =
      String(body?.message || '').trim() ||
      'You have classes waiting on your catch-up list. Open Nexus and pick up where you left off.';
    const subject = 'Your catch-up list';

    const { results, counts } = await sendNudge({
      studentIds,
      subject,
      plain: text,
      html: plainToHtml(text),
      teamsText: subject,
      eventType: 'catchup_behind_pace',
      metadata: { sent_by: staff.id },
    });

    // Share the cron's cooldown clock, so a teacher nudging by hand on Sunday
    // stops the automatic one landing on Monday morning as well.
    const journeyIds: string[] = Array.isArray(body?.journeyIds) ? body.journeyIds : [];
    for (const id of journeyIds) {
      try {
        await markJourneyNudged(id, supabase);
      } catch {
        // Cosmetic; a duplicate nudge is better than a failed one.
      }
    }

    return NextResponse.json({ ok: true, results, counts });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
