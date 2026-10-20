/**
 * Unpaid student-pays links get a nudge on day 1, on day 3, and two days
 * before they expire; an expired link is closed and both sides are told.
 * This is the pure plan; the cron (/api/cron/enrolment-reminders) applies it.
 * One nudge at a time, never two within 24 hours, nothing after a submission.
 */
export interface ReminderLinkRow {
  id: string;
  status: string;
  payment_mode: string | null;
  created_at: string;
  expires_at: string;
  submitted_at: string | null;
  reminder_count: number | null;
  last_reminder_at: string | null;
}

export type ReminderStage = 'day1' | 'day3' | 'last_chance';
export type ReminderAction = { linkId: string; action: 'remind'; stage: ReminderStage } | { linkId: string; action: 'expire' };

const HOUR = 3600 * 1000;

export function planEnrolmentReminders(links: ReminderLinkRow[], now: Date): ReminderAction[] {
  const out: ReminderAction[] = [];
  const t = now.getTime();
  for (const link of links) {
    if (link.status !== 'active' || link.payment_mode !== 'student_pays' || link.submitted_at) continue;
    const expires = new Date(link.expires_at).getTime();
    if (!Number.isFinite(expires)) continue;
    if (expires <= t) {
      out.push({ linkId: link.id, action: 'expire' });
      continue;
    }
    const ageH = (t - new Date(link.created_at).getTime()) / HOUR;
    const sinceLastH = link.last_reminder_at ? (t - new Date(link.last_reminder_at).getTime()) / HOUR : Infinity;
    const untilExpiryH = (expires - t) / HOUR;
    const count = Number(link.reminder_count) || 0;

    let stage: ReminderStage | null = null;
    if (count === 0 && ageH >= 24) stage = 'day1';
    else if (count === 1 && ageH >= 72 && sinceLastH >= 24) stage = 'day3';
    else if (count === 2 && untilExpiryH <= 48 && sinceLastH >= 24) stage = 'last_chance';
    if (stage) out.push({ linkId: link.id, action: 'remind', stage });
  }
  return out;
}
