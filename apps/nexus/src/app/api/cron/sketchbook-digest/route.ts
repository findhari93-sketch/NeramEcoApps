import { NextRequest, NextResponse } from 'next/server';
import { getNexusSetting, getSupabaseAdminClient } from '@neram/database';
import { loadClassroomRoster } from '@neram/database/queries/nexus';
import { assertCronRequest } from '@/lib/cron-auth';
import { FEATURE_FLAGS_KEY, isFeatureEnabled, resolveFlags } from '@/lib/feature-flags';
import { istDate } from '@/lib/sketchbook-rhythm';
import { clampDates, trackingStart } from '@/lib/sketchbook-status';
import { loadDrawingDays, loadReactivations } from '@/lib/drawing-activity-store';
import { loadReminderLogs } from '@/lib/sketchbook-reminder-store';
import { buildTeacherDigest, decideReminder } from '@/lib/sketchbook-reminders';
import { sendNudge } from '@/lib/nudge-delivery';
import { renewSenders } from '@/lib/teams-sender';

export const maxDuration = 60;

/**
 * GET /api/cron/sketchbook-digest   (Vercel cron, 16:00 UTC = 21:30 IST)
 *
 * One evening message per teacher instead of a ping per upload: forty students
 * uploading would otherwise be forty interruptions. It says how many sketches
 * arrived today from tracked students in the classes they teach, and who has
 * gone quiet after three reminders and needs a call. Nothing to say, nothing sent.
 *
 * 21:30 because students draw after school: launch day's sketches all arrived
 * between 15:52 and 21:05 IST. One row per teacher per day in
 * nexus_sketchbook_digests makes a rerun a no-op.
 */
export async function GET(request: NextRequest) {
  const unauthorized = assertCronRequest(request, { required: true });
  if (unauthorized) return unauthorized;

  try {
    // Keep every "Connect Teams" login alive, whatever the flags say: a login left
    // unused goes stale, and then automatic reminders stop without anyone noticing.
    // A teacher whose login stopped working is told once, on their bell.
    const renewal = await renewSenders().catch((e) => {
      console.error('[cron/sketchbook-digest] sender renewal failed:', e);
      return { renewed: 0, failed: [] as Array<{ userId: string; reason: string; revoked: boolean }> };
    });
    for (const f of renewal.failed.filter((x) => x.revoked)) {
      await sendNudge({
        studentIds: [f.userId],
        audience: 'staff',
        subject: 'Reconnect Teams to keep automatic reminders going',
        plain: 'Nexus can no longer send reminders from your Teams. Open Sketchbooks, Class rhythm, and press Connect Teams again. Until then students get reminders as a Teams alert and on the Nexus bell.',
        eventType: 'sketch_digest',
        metadata: { teams_sender_problem: true },
        source: { kind: 'teams_sender_lost' },
      });
    }

    const setting = await getNexusSetting(FEATURE_FLAGS_KEY).catch(() => null);
    const flags = resolveFlags((setting?.value as Record<string, boolean>) || {});
    if (!isFeatureEnabled('staff.sketchbook', flags) || !isFeatureEnabled('staff.sketchbook-digest', flags)) {
      return NextResponse.json({ skipped: 'Sketchbook digest is switched off in Features.', sendersRenewed: renewal.renewed });
    }

    const supabase = getSupabaseAdminClient() as any;
    const today = istDate(new Date());
    const dayStart = `${today}T00:00:00+05:30`;

    const { data: classrooms, error } = await supabase
      .from('nexus_classrooms')
      .select('id, name, sketchbook_started_on')
      .eq('is_active', true);
    if (error) throw error;

    type Tally = { names: string[]; sketches: number; students: Set<string>; needsCall: number; classroomIds: string[] };
    const byTeacher = new Map<string, Tally>();

    for (const room of (classrooms || []) as any[]) {
      const roster = await loadClassroomRoster(room.id);
      const ids = roster.ids;
      if (!ids.length) continue;

      const { data: teachers } = await supabase
        .from('nexus_enrollments')
        .select('user_id')
        .eq('classroom_id', room.id)
        .eq('role', 'teacher')
        .eq('is_active', true);
      const teacherIds = [...new Set(((teachers || []) as any[]).map((t) => t.user_id as string))];
      if (!teacherIds.length) continue;

      const [{ data: sketches, error: sketchError }, reactivations, logs] = await Promise.all([
        supabase
          .from('drawing_submissions')
          .select('student_id')
          .eq('source_type', 'sketchbook')
          .in('student_id', ids)
          .gte('submitted_at', dayStart),
        loadReactivations(room.id, ids),
        loadReminderLogs(ids),
      ]);
      if (sketchError) throw sketchError;

      const starts = Object.fromEntries(
        roster.members.map((m) => [
          m.user_id,
          trackingStart({ classroomStartedOn: room.sketchbook_started_on, enrolledAt: m.enrolled_at, reactivatedOn: reactivations[m.user_id] }),
        ]),
      );
      const since = Object.values(starts).reduce((a, b) => (b < a ? b : a));
      const days = await loadDrawingDays(ids, since);
      let needsCall = 0;
      for (const id of ids) {
        const dates = clampDates(days[id] || [], starts[id], today);
        const d = decideReminder(
          { studentId: id, classroomId: room.id, start: starts[id], lastDrawingDate: dates.length ? dates[dates.length - 1] : null, dormantHere: false, goal: 3 },
          (logs[id] || []) as any,
          today,
        );
        if (d.kind === 'needs_call') needsCall += 1;
      }

      const sketchRows = (sketches || []) as Array<{ student_id: string }>;
      for (const teacherId of teacherIds) {
        const t = byTeacher.get(teacherId) || { names: [], sketches: 0, students: new Set<string>(), needsCall: 0, classroomIds: [] };
        t.names.push(room.name);
        t.sketches += sketchRows.length;
        sketchRows.forEach((s) => t.students.add(s.student_id));
        t.needsCall += needsCall;
        t.classroomIds.push(room.id);
        byTeacher.set(teacherId, t);
      }
    }

    let sent = 0;
    let quiet = 0;
    for (const [teacherId, t] of byTeacher) {
      const digest = buildTeacherDigest({
        classroomName: t.names.length === 1 ? t.names[0] : 'Your classes',
        sketches: t.sketches,
        students: t.students.size,
        needsCall: t.needsCall,
      });
      if (!digest) {
        quiet += 1;
        continue;
      }
      // Claim the day first, so a rerun never sends a second digest.
      const { error: claimError } = await supabase.from('nexus_sketchbook_digests').insert({
        teacher_id: teacherId, digest_date: today, sketches: t.sketches, students: t.students.size, needs_call: t.needsCall,
      });
      if (claimError) {
        if (claimError.code === '23505') continue;
        throw claimError;
      }
      const { results } = await sendNudge({
        studentIds: [teacherId],
        audience: 'staff',
        subject: digest.subject,
        plain: digest.plain,
        eventType: 'sketch_digest',
        metadata: { needs_call: t.needsCall, classroom_ids: t.classroomIds },
        source: { kind: 'sketchbook_digest' },
      });
      await supabase
        .from('nexus_sketchbook_digests')
        .update({ channel: results[0]?.channel ?? 'failed', reasons: results[0]?.reasons ?? null })
        .eq('teacher_id', teacherId)
        .eq('digest_date', today);
      sent += 1;
    }

    return NextResponse.json({
      today,
      teachers: byTeacher.size,
      sent,
      nothingToSay: quiet,
      sendersRenewed: renewal.renewed,
      sendersLost: renewal.failed.filter((f) => f.revoked).length,
    });
  } catch (err) {
    console.error('[cron/sketchbook-digest] failed:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Sketchbook digest failed' }, { status: 500 });
  }
}
