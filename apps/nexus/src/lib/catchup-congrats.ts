/**
 * Congratulate a student the moment they clear a missed class, and once more,
 * bigger, when nothing is left.
 *
 * This replaced the Standing tab's "Congratulate in Teams" button (2026-10),
 * which posted to the class group, depended on a teacher remembering, and named
 * the same students over and over as they cleared one more class each week. The
 * founder's brief: congratulate each student individually after each catch-up,
 * and give a bigger congratulation when their whole list is clear.
 *
 * The claim is the whole safety story. `congratulated_at` is stamped with a
 * conditional UPDATE (`... IS NULL ... RETURNING`), and only the caller that won
 * a row may message about it, so two writers racing on the same clear (the
 * student's tap and the backlog read that follows it) cannot both send.
 *
 * Only clears that are FRESH get a message. A class cleared days ago that was
 * somehow never claimed (a clear stamped before the migration ran, or while the
 * switch was off) is claimed silently: "well done" a week late reads as a bug.
 *
 * Callers pass only student work. A teacher excusing a class, or "No class was
 * taught", is not an achievement and never reaches here; `excused_at IS NULL`
 * in the claim enforces it anyway.
 *
 * Never throws into the caller. A congratulation that fails must not fail the
 * student's "Mark caught up".
 */

import { getNexusSetting, istTodayYmd } from '@neram/database';
import { FEATURE_FLAGS_KEY, isFeatureEnabled, resolveFlags } from './feature-flags';
import { sendNudge, plainToHtmlWithLink } from './nudge-delivery';
import { shareBaseUrl } from './class-share-links';
import { loadClassroomBacklog } from './catchup-cohort';
import { catchupStanding } from './catchup-standing';
import { celebrationState, latestCelebrationByStudent } from './catchup-celebration';
import { formatDay } from './away-windows';

/** A clear older than this is claimed without a message. */
export const FRESH_HOURS = 48;

/** Cleared within this many days of the class counts as quick. */
export const QUICK_DAYS = 2;

export interface ClearedItem {
  title: string | null;
  scheduled_date: string;
  caught_up_at: string;
}

export interface CongratsResult {
  claimed: number;
  messaged: 'none' | 'item' | 'all_clear';
  skipped?: string;
}

function istDay(iso: string): string {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t + 330 * 60_000).toISOString().slice(0, 10) : '';
}

function dayGap(fromYmd: string, toYmd: string): number {
  return Math.round((Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) / 86_400_000);
}

export function isQuick(item: ClearedItem): boolean {
  const d = istDay(item.caught_up_at);
  return !!d && dayGap(item.scheduled_date, d) <= QUICK_DAYS;
}

const q = (t: string | null) => `"${t || 'a class'}"`;

/**
 * The small message. Pure, so the wording is pinned by tests.
 * `left` is work the student can act on; `waitingOnUs` is what we owe them.
 */
export function itemClearedMessage(items: ClearedItem[], left: number, waitingOnUs: number): string {
  const what =
    items.length === 1
      ? `You caught up on ${q(items[0].title)} (${formatDay(items[0].scheduled_date)}).`
      : `You caught up on ${items.length} classes: ${items.map((i) => q(i.title)).join(', ')}.`;
  const quick = items.every(isQuick) ? ' That was quick.' : '';
  let rest: string;
  if (left > 0) rest = left === 1 ? ' One class left on your list.' : ` ${left} classes left on your list.`;
  else if (waitingOnUs > 0) rest = ' The rest are waiting on us to publish their recaps. Nothing for you to do yet.';
  else rest = '';
  return `Nice work, {firstName}. ${what}${quick}${rest}`;
}

/** The bigger message, for a clean slate. */
export function allClearMessage(clearedTotal: number, quickCount: number): string {
  const count = clearedTotal === 1 ? 'the class you missed' : `all ${clearedTotal} classes you missed`;
  const quick =
    clearedTotal > 1 && quickCount >= Math.ceil(clearedTotal / 2)
      ? ` Most of them within ${QUICK_DAYS} days of the class, which is exactly how to stay on track.`
      : '';
  return `You are fully caught up, {firstName}. You have cleared ${count}, and nothing is left on your list.${quick} Well done.`;
}

async function autoCongratsOn(): Promise<boolean> {
  try {
    const setting = await getNexusSetting(FEATURE_FLAGS_KEY);
    const flags = resolveFlags((setting?.value as Record<string, boolean>) || {});
    return isFeatureEnabled('staff.catchup-auto-congrats', flags);
  } catch {
    // A settings read failing should not silently disable good news, and the
    // default for this switch is ON.
    return true;
  }
}

export async function congratulateClears(
  supabase: any,
  opts: { studentId: string; classroomId: string; origin?: string | null; now?: Date },
): Promise<CongratsResult> {
  const { studentId, classroomId } = opts;
  const now = opts.now ?? new Date();
  try {
    if (!(await autoCongratsOn())) return { claimed: 0, messaged: 'none', skipped: 'switched off' };

    const { data: claimed, error: claimErr } = await supabase
      .from('nexus_class_absences')
      .update({ congratulated_at: now.toISOString() })
      .eq('student_id', studentId)
      .eq('classroom_id', classroomId)
      .not('caught_up_at', 'is', null)
      .is('congratulated_at', null)
      .is('excused_at', null)
      .select('id, scheduled_class_id, caught_up_at');
    if (claimErr) {
      // The column not existing yet (code deployed before the migration) is
      // the one expected failure: nothing to claim, nothing to send.
      return { claimed: 0, messaged: 'none', skipped: claimErr.code || 'claim failed' };
    }
    const rows: any[] = claimed || [];
    if (rows.length === 0) return { claimed: 0, messaged: 'none' };

    const freshSince = now.getTime() - FRESH_HOURS * 3600_000;
    const fresh = rows.filter((r) => Date.parse(r.caught_up_at) >= freshSince);
    if (fresh.length === 0) return { claimed: rows.length, messaged: 'none', skipped: 'stale' };

    const { data: classes } = await supabase
      .from('nexus_scheduled_classes')
      .select('id, title, scheduled_date')
      .in('id', fresh.map((r) => r.scheduled_class_id));
    const classById = new Map<string, any>((classes || []).map((c: any) => [c.id, c]));
    const cleared: ClearedItem[] = fresh
      .map((r) => {
        const c = classById.get(r.scheduled_class_id);
        return { title: c?.title ?? null, scheduled_date: String(c?.scheduled_date || '').slice(0, 10), caught_up_at: r.caught_up_at };
      })
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));

    // Where they stand now, from the same pipeline the teacher screen uses, so
    // "nothing left" here and "All clear" there cannot disagree.
    const today = istTodayYmd();
    const backlog = (await loadClassroomBacklog(supabase, classroomId, today, { studentId })).get(studentId);
    const left = backlog?.openCount ?? 0;
    const waitingOnUs = backlog?.blockedOnUs ?? 0;
    const allClear = !!backlog && left === 0 && waitingOnUs === 0;

    const url = `${shareBaseUrl(opts.origin)}/student/catch-up`;
    const link = { url, label: 'Open my catch-up list' };
    const base = {
      studentIds: [studentId],
      assistant: { link },
      source: { kind: 'catchup_congrats', refId: classroomId },
    };

    if (allClear && backlog) {
      const standing = catchupStanding(
        backlog.items.map((i: any, idx: number) => ({
          kind: i.kind ?? null,
          status: backlog.resolved[idx].status,
          scheduledDate: String(i.class.scheduled_date),
          caughtUpAt: i.caught_up_at ?? null,
          followupSentAt: i.followup_sent_at ?? null,
          recordingWatchedAt: i.recording_watched_at ?? null,
          activatedOn: i.activated_on ?? null,
        })),
        today,
      );
      const { data: prior } = await supabase
        .from('nexus_catchup_celebrations')
        .select('id, student_id, source, last_cleared_at, celebrated_at')
        .eq('classroom_id', classroomId)
        .eq('student_id', studentId);
      const latest = latestCelebrationByStudent(prior || []).get(studentId)?.latest ?? null;
      if (celebrationState(standing.lastClearedAt, latest) !== 'congratulated') {
        const quickCount = backlog.items.filter(
          (i: any) => i.caught_up_at && isQuick({ title: null, scheduled_date: String(i.class.scheduled_date), caught_up_at: i.caught_up_at }),
        ).length;
        const text = allClearMessage(standing.clearedTotal, quickCount);
        await sendNudge({
          ...base,
          subject: 'You are fully caught up',
          plain: `${text}\n\n${url}`,
          html: plainToHtmlWithLink(text, url, link.label),
          teamsText: 'You are fully caught up',
          eventType: 'catchup_all_clear',
          metadata: { classroom_id: classroomId, cleared_total: standing.clearedTotal },
        });
        await supabase.from('nexus_catchup_celebrations').insert({
          classroom_id: classroomId,
          student_id: studentId,
          celebrated_by: null,
          source: 'auto',
          cleared_total: standing.clearedTotal,
          last_cleared_at: standing.lastClearedAt,
        });
        return { claimed: rows.length, messaged: 'all_clear' };
      }
    }

    // One message for however many cleared together, never one each.
    const text = itemClearedMessage(cleared, left, waitingOnUs);
    await sendNudge({
      ...base,
      subject: cleared.length === 1 ? 'Class caught up' : `${cleared.length} classes caught up`,
      plain: `${text}\n\n${url}`,
      html: plainToHtmlWithLink(text, url, link.label),
      teamsText: 'Nice work on your catch-up',
      eventType: 'catchup_item_cleared',
      metadata: {
        classroom_id: classroomId,
        scheduled_class_ids: fresh.map((r) => r.scheduled_class_id),
        left,
      },
    });
    return { claimed: rows.length, messaged: 'item' };
  } catch (err) {
    console.error('[catchup-congrats] failed', err instanceof Error ? err.message : err);
    return { claimed: 0, messaged: 'none', skipped: 'error' };
  }
}

/** Pairs per cron run. The student routes catch almost everything first. */
const SWEEP_CAP = 300;

/**
 * The safety net, run daily by /api/cron/catchup-overdue. Finds every clear
 * nobody has claimed yet (a student who passed the test and never opened the
 * app again) and hands each student to `congratulateClears`, which messages the
 * fresh ones and silently claims the stale ones.
 */
export async function sweepUncongratulatedClears(
  supabase: any,
  opts: { dryRun?: boolean } = {},
): Promise<{ pairs: number; messaged: number; skipped?: string }> {
  if (!(await autoCongratsOn())) return { pairs: 0, messaged: 0, skipped: 'switched off' };
  const { data, error } = await supabase
    .from('nexus_class_absences')
    .select('student_id, classroom_id')
    .not('caught_up_at', 'is', null)
    .is('congratulated_at', null)
    .is('excused_at', null)
    .limit(SWEEP_CAP * 4);
  if (error) return { pairs: 0, messaged: 0, skipped: error.code || 'read failed' };

  const pairs = new Map<string, { studentId: string; classroomId: string }>();
  for (const r of data || []) {
    pairs.set(`${r.student_id}:${r.classroom_id}`, { studentId: r.student_id, classroomId: r.classroom_id });
    if (pairs.size >= SWEEP_CAP) break;
  }
  if (opts.dryRun) return { pairs: pairs.size, messaged: 0, skipped: 'dry run' };

  let messaged = 0;
  for (const p of pairs.values()) {
    const r = await congratulateClears(supabase, p);
    if (r.messaged !== 'none') messaged += 1;
  }
  return { pairs: pairs.size, messaged };
}
