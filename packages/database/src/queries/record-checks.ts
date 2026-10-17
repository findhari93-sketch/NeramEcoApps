/**
 * "Send to student to check": staff fill in a student's form and fees in Admin,
 * then ask the student to check it in Nexus. The student either confirms, or
 * reports what is wrong with the fees (they fix their own details directly).
 *
 * Admin writes the check row; Nexus sends it through Neram Assistant (sendNudge
 * lives in Nexus, the one door for student messages) and serves the student's
 * page. Both sides go through these functions so the states stay in step.
 *
 * Tables: student_record_checks, fee_correction_reports, fee_reminder_log
 * (migration 20261204090100). All service role only.
 */

export type RecordCheckStatus =
  | 'queued'
  | 'sent'
  | 'opened'
  | 'confirmed'
  | 'correction_reported'
  | 'changed'
  | 'superseded'
  | 'cancelled';

/** Statuses that still wait on the student. One per student at a time. */
export const LIVE_RECORD_CHECK_STATUSES: RecordCheckStatus[] = ['queued', 'sent', 'opened', 'correction_reported'];

/** Statuses where the student should still be nudged to look at the page. */
export const PENDING_FOR_STUDENT: RecordCheckStatus[] = ['queued', 'sent', 'opened', 'changed'];

export interface RecordCheckRow {
  id: string;
  user_id: string;
  lead_profile_id: string | null;
  status: RecordCheckStatus;
  send_channel: string | null;
  send_attempts: number;
  sent_by: string | null;
  sent_at: string | null;
  opened_at: string | null;
  confirmed_at: string | null;
  confirmed_snapshot: unknown;
  fee_signature: string | null;
  details_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeeCorrectionReportRow {
  id: string;
  check_id: string | null;
  user_id: string;
  lead_profile_id: string | null;
  items: { amount: number; paidOn: string; method: string; reference?: string | null }[];
  note: string;
  status: 'open' | 'accepted' | 'rejected';
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  resulting_payment_ids: string[] | null;
  created_at: string;
}

const CHECK_COLUMNS =
  'id, user_id, lead_profile_id, status, send_channel, send_attempts, sent_by, sent_at, opened_at, confirmed_at, confirmed_snapshot, fee_signature, details_updated_at, created_at, updated_at';

export async function getLatestRecordCheck(supabase: any, userId: string): Promise<RecordCheckRow | null> {
  const { data, error } = await supabase
    .from('student_record_checks')
    .select(CHECK_COLUMNS)
    .eq('user_id', userId)
    .neq('status', 'superseded')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function getRecordCheck(supabase: any, id: string): Promise<RecordCheckRow | null> {
  const { data, error } = await supabase.from('student_record_checks').select(CHECK_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/**
 * Start a new check: any live one is superseded first (the partial unique index
 * allows one live check per student), then a queued row is written. Nexus sends
 * it and marks it sent.
 */
export async function createRecordCheck(
  supabase: any,
  input: { userId: string; leadProfileId: string | null; sentBy: string | null; feeSignature: string | null },
): Promise<RecordCheckRow> {
  const { error: supersedeError } = await supabase
    .from('student_record_checks')
    .update({ status: 'superseded' })
    .eq('user_id', input.userId)
    .in('status', LIVE_RECORD_CHECK_STATUSES);
  if (supersedeError) throw supersedeError;

  const { data, error } = await supabase
    .from('student_record_checks')
    .insert({
      user_id: input.userId,
      lead_profile_id: input.leadProfileId,
      status: 'queued',
      sent_by: input.sentBy,
      fee_signature: input.feeSignature,
    })
    .select(CHECK_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

/** After sendNudge: record how it went out. A queued row only; never undoes a reply. */
export async function markRecordCheckSent(
  supabase: any,
  check: Pick<RecordCheckRow, 'id' | 'send_attempts'>,
  channel: string,
): Promise<void> {
  const { error } = await supabase
    .from('student_record_checks')
    .update({ status: 'sent', send_channel: channel, sent_at: new Date().toISOString(), send_attempts: (check.send_attempts ?? 0) + 1 })
    .eq('id', check.id)
    .eq('status', 'queued');
  if (error) throw error;
}

/** A send that failed: count the attempt, leave it queued for the daily retry. */
export async function markRecordCheckAttemptFailed(
  supabase: any,
  check: Pick<RecordCheckRow, 'id' | 'send_attempts'>,
  channel = 'failed',
): Promise<void> {
  const { error } = await supabase
    .from('student_record_checks')
    .update({ send_channel: channel, send_attempts: (check.send_attempts ?? 0) + 1 })
    .eq('id', check.id)
    .eq('status', 'queued');
  if (error) throw error;
}

export async function listQueuedRecordChecks(supabase: any, maxAttempts = 3): Promise<RecordCheckRow[]> {
  const { data, error } = await supabase
    .from('student_record_checks')
    .select(CHECK_COLUMNS)
    .eq('status', 'queued')
    .lt('send_attempts', maxAttempts)
    .order('created_at', { ascending: true })
    .limit(50);
  if (error) throw error;
  return data || [];
}

/** The student opened the page. Only moves a sent (or queued) check forward. */
export async function markRecordCheckOpened(supabase: any, check: RecordCheckRow): Promise<RecordCheckRow> {
  if (check.opened_at || !['queued', 'sent'].includes(check.status)) return check;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('student_record_checks')
    .update({ status: 'opened', opened_at: now })
    .eq('id', check.id)
    .in('status', ['queued', 'sent']);
  if (error) throw error;
  return { ...check, status: 'opened', opened_at: now };
}

export async function confirmRecordCheck(
  supabase: any,
  checkId: string,
  snapshot: unknown,
  feeSignature: string,
): Promise<void> {
  const { error } = await supabase
    .from('student_record_checks')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString(), confirmed_snapshot: snapshot, fee_signature: feeSignature })
    .eq('id', checkId);
  if (error) throw error;
}

export async function stampRecordCheckDetailsUpdated(supabase: any, userId: string): Promise<void> {
  const { error } = await supabase
    .from('student_record_checks')
    .update({ details_updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .in('status', [...LIVE_RECORD_CHECK_STATUSES, 'changed', 'confirmed']);
  if (error) throw error;
}

/**
 * Staff changed the fee after the student confirmed it: the confirmation no
 * longer covers what is on record. Called by the fee writer.
 */
export async function markConfirmedCheckChanged(supabase: any, userId: string, newSignature: string): Promise<boolean> {
  const latest = await getLatestRecordCheck(supabase, userId);
  if (!latest || latest.status !== 'confirmed' || latest.fee_signature === newSignature) return false;
  const { error } = await supabase.from('student_record_checks').update({ status: 'changed' }).eq('id', latest.id);
  if (error) throw error;
  return true;
}

// ─── fee correction reports ──────────────────────────────────────────────────

const REPORT_COLUMNS =
  'id, check_id, user_id, lead_profile_id, items, note, status, resolved_by, resolved_at, resolution_note, resulting_payment_ids, created_at';

export async function createFeeCorrectionReport(
  supabase: any,
  input: {
    check: Pick<RecordCheckRow, 'id' | 'user_id' | 'lead_profile_id'>;
    items: FeeCorrectionReportRow['items'];
    note: string;
  },
): Promise<FeeCorrectionReportRow> {
  // One open report at a time: a second "Something is wrong" replaces the first,
  // so staff never act on an out-of-date version.
  const { error: closeError } = await supabase
    .from('fee_correction_reports')
    .update({ status: 'rejected', resolution_note: 'Replaced by a newer report from the student.', resolved_at: new Date().toISOString() })
    .eq('user_id', input.check.user_id)
    .eq('status', 'open');
  if (closeError) throw closeError;

  const { data, error } = await supabase
    .from('fee_correction_reports')
    .insert({
      check_id: input.check.id,
      user_id: input.check.user_id,
      lead_profile_id: input.check.lead_profile_id,
      items: input.items,
      note: input.note,
    })
    .select(REPORT_COLUMNS)
    .single();
  if (error) throw error;

  const { error: checkError } = await supabase
    .from('student_record_checks')
    .update({ status: 'correction_reported' })
    .eq('id', input.check.id);
  if (checkError) throw checkError;
  return data;
}

export async function getFeeCorrectionReport(supabase: any, id: string): Promise<FeeCorrectionReportRow | null> {
  const { data, error } = await supabase.from('fee_correction_reports').select(REPORT_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function getOpenFeeCorrection(supabase: any, userId: string): Promise<FeeCorrectionReportRow | null> {
  const { data, error } = await supabase
    .from('fee_correction_reports')
    .select(REPORT_COLUMNS)
    .eq('user_id', userId)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function listOpenFeeCorrections(supabase: any, userIds?: string[]): Promise<FeeCorrectionReportRow[]> {
  let query = supabase.from('fee_correction_reports').select(REPORT_COLUMNS).eq('status', 'open').order('created_at', { ascending: false });
  if (userIds) {
    if (!userIds.length) return [];
    query = query.in('user_id', userIds);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Close a report. Accepting goes through the fee writer (it is called from there
 * with the payments it created), so money is still written in one place only.
 */
export async function resolveFeeCorrectionReport(
  supabase: any,
  input: {
    reportId: string;
    status: 'accepted' | 'rejected';
    resolvedBy: string | null;
    note?: string | null;
    paymentIds?: string[];
  },
): Promise<FeeCorrectionReportRow | null> {
  const { data, error } = await supabase
    .from('fee_correction_reports')
    .update({
      status: input.status,
      resolved_by: input.resolvedBy,
      resolved_at: new Date().toISOString(),
      resolution_note: input.note ?? null,
      resulting_payment_ids: input.paymentIds?.length ? input.paymentIds : null,
    })
    .eq('id', input.reportId)
    .eq('status', 'open')
    .select(REPORT_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (data?.check_id) {
    // The student's check is answered either way. They see the outcome on the page.
    const { error: checkError } = await supabase
      .from('student_record_checks')
      .update({ status: input.status === 'accepted' ? 'changed' : 'sent' })
      .eq('id', data.check_id)
      .eq('status', 'correction_reported');
    if (checkError) throw checkError;
  }
  return data ?? null;
}

// ─── reminders sent ──────────────────────────────────────────────────────────

/**
 * Claim a reminder before sending it. Returns false when it was already claimed
 * (by an earlier run, or a run happening at the same moment), so it is sent once.
 */
export async function claimFeeReminder(
  supabase: any,
  reminder: { installmentId: string; userId: string; kind: string; dueDate: string; dedupeKey: string },
  audience: 'staff' | 'student',
): Promise<string | null> {
  const { data, error } = await supabase
    .from('fee_reminder_log')
    .upsert(
      {
        installment_id: reminder.installmentId,
        user_id: reminder.userId,
        audience,
        kind: reminder.kind,
        due_date: reminder.dueDate,
        dedupe_key: reminder.dedupeKey,
      },
      { onConflict: 'dedupe_key', ignoreDuplicates: true },
    )
    .select('id');
  if (error) throw error;
  return data?.[0]?.id ?? null;
}

export async function setFeeReminderChannel(supabase: any, id: string, channel: string): Promise<void> {
  const { error } = await supabase.from('fee_reminder_log').update({ channel }).eq('id', id);
  if (error) throw error;
}

/** Give a claim back when the send failed, so tomorrow's run can try again. */
export async function releaseFeeReminder(supabase: any, id: string): Promise<void> {
  const { error } = await supabase.from('fee_reminder_log').delete().eq('id', id);
  if (error) throw error;
}
