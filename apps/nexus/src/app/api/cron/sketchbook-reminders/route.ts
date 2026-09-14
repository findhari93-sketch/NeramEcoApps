import { NextRequest, NextResponse } from 'next/server';
import { getNexusSetting, getSupabaseAdminClient } from '@neram/database';
import { loadClassroomRoster } from '@neram/database/queries/nexus';
import { assertCronRequest } from '@/lib/cron-auth';
import { FEATURE_FLAGS_KEY, isFeatureEnabled, resolveFlags } from '@/lib/feature-flags';
import { istDate } from '@/lib/sketchbook-rhythm';
import { clampDates, trackingStart } from '@/lib/sketchbook-status';
import { loadDrawingDays, loadReactivations } from '@/lib/drawing-activity-store';
import { claimAutoReminder, finishReminder, loadReminderLogs } from '@/lib/sketchbook-reminder-store';
import { planReminderRun, reminderMessage, type PlannedSend, type ReminderCandidate } from '@/lib/sketchbook-reminders';
import { sendNudge } from '@/lib/nudge-delivery';
import { shareBaseUrl } from '@/lib/class-share-links';

export const maxDuration = 60;

const FALLBACK_ORIGIN = 'https://nexus.neramclasses.com';

/**
 * GET /api/cron/sketchbook-reminders            (Vercel cron, 12:30 UTC = 18:00 IST)
 * GET /api/cron/sketchbook-reminders?dryRun=1   (same auth; decides, sends nothing)
 *
 * Reminds students who have not drawn for 3, 6 and 9 days (sketchbook-reminders.ts
 * has the rules and why). Each step is CLAIMED in nexus_sketchbook_reminders
 * before it is sent, so a rerun or two overlapping runs cannot double-message.
 * Everything goes through sendNudge: bot chat when set up, activity feed as the
 * fallback, the Nexus bell always, and a receipt per student. Never a group post.
 *
 * Off until `staff.sketchbook-reminders` is switched on in Features. A dry run
 * works either way, so the first real evening can be previewed.
 */
export async function GET(request: NextRequest) {
  const unauthorized = assertCronRequest(request, { required: true });
  if (unauthorized) return unauthorized;
  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';

  try {
    const setting = await getNexusSetting(FEATURE_FLAGS_KEY).catch(() => null);
    const flags = resolveFlags((setting?.value as Record<string, boolean>) || {});
    if (!isFeatureEnabled('student.sketchbook', flags)) {
      return NextResponse.json({ skipped: 'Students cannot use the sketchbook, so nobody is reminded.' });
    }
    const enabled = isFeatureEnabled('staff.sketchbook-reminders', flags);
    if (!enabled && !dryRun) {
      return NextResponse.json({ skipped: 'Automatic sketchbook reminders are switched off in Features.' });
    }

    const today = istDate(new Date());
    const supabase = getSupabaseAdminClient() as any;
    const { data: classrooms, error } = await supabase
      .from('nexus_classrooms')
      .select('id, name, sketchbook_started_on, sketchbook_weekly_goal')
      .eq('is_active', true);
    if (error) throw error;

    // One candidate per student: the classroom of their newest enrolment, the same
    // "newest wins" rule the student's own sketchbook uses.
    const byStudent = new Map<string, ReminderCandidate & { enrolledAt: string }>();
    for (const room of (classrooms || []) as any[]) {
      // Tracked students only: dormant, removed and alumni never load.
      const roster = await loadClassroomRoster(room.id);
      if (!roster.members.length) continue;
      const reactivations = await loadReactivations(room.id, roster.ids);
      for (const m of roster.members) {
        const existing = byStudent.get(m.user_id);
        if (existing && existing.enrolledAt >= m.enrolled_at) continue;
        byStudent.set(m.user_id, {
          studentId: m.user_id,
          classroomId: room.id,
          start: trackingStart({
            classroomStartedOn: room.sketchbook_started_on,
            enrolledAt: m.enrolled_at,
            reactivatedOn: reactivations[m.user_id],
          }),
          lastDrawingDate: null,
          dormantHere: false,
          goal: room.sketchbook_weekly_goal ?? 3,
          enrolledAt: m.enrolled_at,
        });
      }
    }

    const candidates = [...byStudent.values()];
    if (!candidates.length) return NextResponse.json({ dryRun, candidates: 0, sent: 0 });

    const ids = candidates.map((c) => c.studentId);
    const since = candidates.reduce((a, c) => (c.start < a ? c.start : a), candidates[0].start);
    const [days, logs] = await Promise.all([loadDrawingDays(ids, since), loadReminderLogs(ids)]);
    for (const c of candidates) {
      const dates = clampDates(days[c.studentId] || [], c.start, today);
      c.lastDrawingDate = dates.length ? dates[dates.length - 1] : null;
    }

    const plan = planReminderRun(candidates, logs as any, today);
    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        enabled,
        today,
        candidates: candidates.length,
        wouldSend: plan.sends.map((s) => ({ studentId: s.studentId, step: s.step, quietDays: s.quietDays, neverDrew: !s.lastDrawingDate })),
        needsCall: plan.needsCall.length,
        skipped: plan.skipped,
      });
    }

    // Claim first. Anything another run already claimed is dropped here.
    const claimed: Array<PlannedSend & { claimId: string | null }> = [];
    for (const s of plan.sends) {
      const r = await claimAutoReminder({
        studentId: s.studentId, classroomId: s.classroomId, cycleStart: s.cycleStart, step: s.step, quietDays: s.quietDays, sentOn: today,
      });
      if (r.claimed) claimed.push({ ...s, claimId: r.id });
    }

    // One sendNudge per message variant, so each batch shares its words.
    const groups = new Map<string, typeof claimed>();
    for (const s of claimed) {
      const key = `${s.step}|${s.lastDrawingDate ? 'drew' : 'never'}|${s.goal}`;
      groups.set(key, [...(groups.get(key) || []), s]);
    }
    const url = `${shareBaseUrl(FALLBACK_ORIGIN)}/student/sketchbook?add=1`;
    let reached = 0;
    let unreached = 0;
    for (const group of groups.values()) {
      const first = group[0];
      const msg = reminderMessage(first.step, !first.lastDrawingDate, first.goal);
      const { results } = await sendNudge({
        studentIds: group.map((g) => g.studentId),
        subject: msg.subject,
        plain: msg.plain,
        teamsText: msg.subject,
        eventType: 'sketch_rhythm_nudge',
        metadata: { source: 'sketchbook_reminder', step: first.step },
        bot: { card: { title: msg.subject, body: msg.plain, buttonLabel: msg.buttonLabel, url } },
        source: { kind: 'sketchbook_reminder' },
      });
      const byId = new Map(results.map((r) => [r.studentId, r]));
      for (const g of group) {
        const r = byId.get(g.studentId);
        if (r?.ok) reached += 1;
        else unreached += 1;
        if (g.claimId) await finishReminder(g.claimId, r?.channel || 'failed', r?.reasons ?? null);
      }
    }

    return NextResponse.json({
      today,
      candidates: candidates.length,
      sent: claimed.length,
      reached,
      unreached,
      needsCall: plan.needsCall.length,
      skipped: plan.skipped,
    });
  } catch (err) {
    console.error('[cron/sketchbook-reminders] failed:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Sketchbook reminders failed' }, { status: 500 });
  }
}
