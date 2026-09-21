import { NextRequest, NextResponse } from 'next/server';
import { getNexusSetting, getSupabaseAdminClient } from '@neram/database';
import { assertCronRequest } from '@/lib/cron-auth';
import { FEATURE_FLAGS_KEY, isFeatureEnabled, resolveFlags } from '@/lib/feature-flags';
import { joinReminderDue, joinReminderMessage } from '@/lib/not-started';
import { hasMicrosoftAccount } from '@/lib/microsoft-account';
import { sendNudge } from '@/lib/nudge-delivery';
import { shareBaseUrl } from '@/lib/class-share-links';
import { classroomSenders } from '@/lib/teams-sender';

export const maxDuration = 60;

const FALLBACK_ORIGIN = 'https://nexus.neramclasses.com';

interface Candidate {
  enrollmentId: string;
  studentId: string;
  classroomId: string;
  enrolledAt: string;
  step: 1 | 2 | 3;
  sent: number;
}

/**
 * GET /api/cron/join-reminders            (Vercel cron, 13:00 UTC = 18:30 IST)
 * GET /api/cron/join-reminders?dryRun=1   (same auth; decides, sends nothing)
 *
 * Reminds Not started students (enrolled, never entered Nexus, lib/not-started.ts)
 * on day 1, 3 and 7, then stops. After 14 days the Students page asks staff to
 * decide instead.
 *
 * Each reminder is CLAIMED before it is sent by bumping join_reminders_sent only
 * if it still holds the value we read, so an overlapping run or a rerun cannot
 * message anyone twice. A claimed reminder whose send fails is not retried: one
 * missed nudge is better than a student getting the same message three times.
 *
 * Everything goes through sendNudge with reachNotStarted, as the classroom's
 * connected teacher. The chat is what matters here: a student stuck at the photo
 * gate cannot see the Nexus bell. Students with no Microsoft account are skipped,
 * because they cannot sign in to act on it anyway (the Students page flags them).
 *
 * Off until `staff.join-reminders` is switched on in Features. A dry run works
 * either way.
 */
export async function GET(request: NextRequest) {
  const unauthorized = assertCronRequest(request, { required: true });
  if (unauthorized) return unauthorized;
  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';

  try {
    const setting = await getNexusSetting(FEATURE_FLAGS_KEY).catch(() => null);
    const flags = resolveFlags((setting?.value as Record<string, boolean>) || {});
    const enabled = isFeatureEnabled('staff.join-reminders', flags);
    if (!enabled && !dryRun) {
      return NextResponse.json({ skipped: 'Join reminders are switched off in Features.' });
    }

    const supabase = getSupabaseAdminClient() as any;
    const { data, error } = await supabase
      .from('nexus_enrollments')
      .select(
        'id, user_id, classroom_id, enrolled_at, dormant_since, join_reminders_sent, ' +
          'user:users!nexus_enrollments_user_id_fkey(id, ms_oid, is_alumni, nexus_entered_at), ' +
          'classroom:nexus_classrooms(id, is_active, is_archived)',
      )
      .eq('role', 'student')
      .eq('is_active', true)
      .eq('participation_status', 'dormant')
      .eq('dormant_source', 'auto');
    if (error) throw error;

    // One reminder per student even with two Not started enrolments: the newest wins.
    const now = Date.now();
    const byStudent = new Map<string, Candidate>();
    let noMicrosoft = 0;
    for (const row of (data || []) as any[]) {
      if (!row.user || row.user.is_alumni || row.user.nexus_entered_at) continue;
      if (!row.classroom || row.classroom.is_active === false || row.classroom.is_archived === true) continue;
      if (!hasMicrosoftAccount(row.user.ms_oid)) {
        noMicrosoft += 1;
        continue;
      }
      const sent = Number(row.join_reminders_sent) || 0;
      const step = joinReminderDue(row.dormant_since, sent, now);
      if (!step) continue;
      const existing = byStudent.get(row.user_id);
      if (existing && existing.enrolledAt >= row.enrolled_at) continue;
      byStudent.set(row.user_id, {
        enrollmentId: row.id,
        studentId: row.user_id,
        classroomId: row.classroom_id,
        enrolledAt: row.enrolled_at,
        step,
        sent,
      });
    }

    const due = [...byStudent.values()];
    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        enabled,
        wouldSend: due.map((c) => ({ studentId: c.studentId, classroomId: c.classroomId, step: c.step })),
        noMicrosoft,
      });
    }

    // Claim first. A row another run already bumped returns nothing and is dropped.
    const claimed: Candidate[] = [];
    for (const c of due) {
      const { data: won, error: claimError } = await supabase
        .from('nexus_enrollments')
        .update({ join_reminders_sent: c.sent + 1 })
        .eq('id', c.enrollmentId)
        .eq('join_reminders_sent', c.sent)
        .eq('dormant_source', 'auto')
        .select('id');
      if (claimError) {
        console.error('[cron/join-reminders] claim failed for', c.enrollmentId, claimError.message);
        continue;
      }
      if (won?.length) claimed.push(c);
    }

    // One sendNudge per classroom and step, sent as Neram Assistant. The
    // classroom's connected teacher is the fallback while the Assistant is off.
    const senders = await classroomSenders([...new Set(claimed.map((c) => c.classroomId))]);
    const groups = new Map<string, Candidate[]>();
    for (const c of claimed) {
      const key = `${c.classroomId}|${c.step}`;
      groups.set(key, [...(groups.get(key) || []), c]);
    }

    const url = `${shareBaseUrl(FALLBACK_ORIGIN)}/student`;
    let reached = 0;
    let viaChat = 0;
    for (const group of groups.values()) {
      const first = group[0];
      const msg = joinReminderMessage(first.step);
      const sender = senders[first.classroomId];
      const { results } = await sendNudge({
        studentIds: group.map((g) => g.studentId),
        subject: msg.subject,
        plain: msg.plain,
        teamsText: msg.subject,
        eventType: 'classroom_enrolled',
        metadata: { source: 'join_reminder', step: first.step, classroom_id: first.classroomId },
        reachNotStarted: true,
        assistant: { link: { url, label: msg.buttonLabel }, fallbackSenderUserId: sender?.userId ?? null },
        source: { kind: 'join_reminder', refId: first.classroomId },
      });
      reached += results.filter((r) => r.ok).length;
      viaChat += results.filter((r) => r.chat).length;
    }

    return NextResponse.json({ due: due.length, sent: claimed.length, reached, viaChat, noMicrosoft });
  } catch (err) {
    const message = err && typeof err === 'object' && 'message' in err ? String((err as any).message) : 'Join reminders failed';
    console.error('[cron/join-reminders] failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
