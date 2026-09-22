/**
 * Reads and writes nexus_sketchbook_reminders (migration 20260917090000).
 * Decisions live in sketchbook-reminders.ts. Server only.
 */

import { getSupabaseAdminClient } from '@neram/database';

export interface ReminderLogRow {
  kind: 'auto' | 'teacher';
  cycleStart: string;
  step: 1 | 2 | 3 | null;
  sentOn: string;
  /** sendNudge's channel for this send (`chat+inapp`, `teams+inapp`, `inapp`, `failed`), null until delivered. */
  channel?: string | null;
}

function client(): any {
  return getSupabaseAdminClient() as any;
}

/** Every reminder row per student, oldest first. Every requested id gets a key. */
export async function loadReminderLogs(studentIds: string[]): Promise<Record<string, ReminderLogRow[]>> {
  const out: Record<string, ReminderLogRow[]> = {};
  for (const id of studentIds) out[id] = [];
  if (studentIds.length === 0) return out;
  const { data, error } = await client()
    .from('nexus_sketchbook_reminders')
    .select('student_id, kind, cycle_start, step, sent_on, channel')
    .in('student_id', studentIds)
    .order('created_at', { ascending: true });
  if (error) throw error;
  for (const r of (data || []) as any[]) {
    (out[r.student_id] ||= []).push({
      kind: r.kind, cycleStart: r.cycle_start, step: r.step ?? null, sentOn: r.sent_on, channel: r.channel ?? null,
    });
  }
  return out;
}

export interface ReminderCycleFacts {
  cycleStart: string;
  /** Automatic steps only: what "Needs a call" counts. */
  autoSteps: number;
  /** Every reminder in the cycle, automatic and teacher-pressed: what staff read as "reminded N times". */
  sentThisCycle: number;
  lastSentOn: string | null;
  /** Channel of the newest reminder, so the screen can say whether it reached Teams. */
  lastChannel: string | null;
}

/** Fold one student's rows (oldest first) into the facts about their newest cycle. Pure. */
export function foldReminderCycle(rows: ReminderLogRow[]): ReminderCycleFacts | null {
  if (!rows.length) return null;
  const latestCycle = rows.reduce((a, r) => (r.cycleStart > a ? r.cycleStart : a), rows[0].cycleStart);
  const inCycle = rows.filter((r) => r.cycleStart === latestCycle);
  // Rows arrive oldest first, so the last one with the newest day is the newest send.
  let newest: ReminderLogRow | null = null;
  for (const r of rows) if (!newest || r.sentOn >= newest.sentOn) newest = r;
  return {
    cycleStart: latestCycle,
    autoSteps: inCycle.filter((r) => r.kind === 'auto').length,
    sentThisCycle: inCycle.length,
    lastSentOn: newest?.sentOn ?? null,
    lastChannel: newest?.channel ?? null,
  };
}

/**
 * Reminders in the student's most recent cycle, and the last send. The rhythm
 * screen uses autoSteps for "Needs a call"; a cycle that is no longer current
 * cannot produce needs_call because that also requires 9 quiet days since the
 * cycle's own start, which a new drawing resets.
 */
export async function loadRemindersThisCycle(studentIds: string[]): Promise<Record<string, ReminderCycleFacts>> {
  const logs = await loadReminderLogs(studentIds);
  const out: Record<string, ReminderCycleFacts> = {};
  for (const [id, rows] of Object.entries(logs)) {
    const facts = foldReminderCycle(rows);
    if (facts) out[id] = facts;
  }
  return out;
}

/**
 * Claim one automatic step before sending. Returns false when another run already
 * claimed this step or already sent today (the unique indexes), so the caller skips.
 */
export async function claimAutoReminder(row: {
  studentId: string; classroomId: string; cycleStart: string; step: 1 | 2 | 3; quietDays: number; sentOn: string;
}): Promise<{ claimed: boolean; id: string | null }> {
  const { data, error } = await client()
    .from('nexus_sketchbook_reminders')
    .insert({
      student_id: row.studentId,
      classroom_id: row.classroomId,
      kind: 'auto',
      cycle_start: row.cycleStart,
      step: row.step,
      quiet_days: row.quietDays,
      sent_on: row.sentOn,
    })
    .select('id')
    .maybeSingle();
  if (error) {
    if (error.code === '23505') return { claimed: false, id: null };
    throw error;
  }
  return { claimed: true, id: data?.id ?? null };
}

export async function recordTeacherReminder(row: {
  studentId: string; classroomId: string; sentBy: string; cycleStart: string; quietDays: number; sentOn: string;
  channel: string; reasons: unknown;
}): Promise<void> {
  const { error } = await client().from('nexus_sketchbook_reminders').insert({
    student_id: row.studentId,
    classroom_id: row.classroomId,
    kind: 'teacher',
    sent_by: row.sentBy,
    cycle_start: row.cycleStart,
    step: null,
    quiet_days: row.quietDays,
    sent_on: row.sentOn,
    channel: row.channel,
    reasons: row.reasons ?? null,
  });
  if (error) throw error;
}

export async function finishReminder(id: string, channel: string, reasons: unknown): Promise<void> {
  const { error } = await client()
    .from('nexus_sketchbook_reminders')
    .update({ channel, reasons: reasons ?? null })
    .eq('id', id);
  if (error) console.error('[sketchbook-reminders] could not record delivery for', id, error);
}
