/**
 * Sending "Check your details" to a student, and telling them what the office
 * did with their fee report.
 *
 * Admin writes the student_record_checks row (status 'queued') and asks Nexus to
 * send it through POST /api/internal/student-record-check, because sendNudge,
 * the one door for messages to a student, lives here. If Nexus cannot be reached
 * the row stays queued and the daily fee-reminders cron sends it with the same
 * function, at most 3 tries.
 *
 * Neram Assistant with no `from`: the school is asking, not a person starting a
 * conversation (the precedent is the application-details nudge, founder
 * 2026-09-20). reachNotStarted, because many of these students have never opened
 * Nexus; students PAUSED by staff are still dropped.
 */
import {
  getRecordCheck,
  markRecordCheckAttemptFailed,
  markRecordCheckSent,
  type FeeCorrectionReportRow,
  type RecordCheckRow,
} from '@neram/database/queries';
import { sendNudge } from './nudge-delivery';
import { shareBaseUrl } from './class-share-links';
import {
  CHECK_DETAILS_PATH,
  CHECK_MESSAGE,
  deliveryChannel,
  deliveryLanded,
  deliverySummary,
  resolutionMessage,
  type DeliveryChannel,
} from './fee-check-copy';

export interface DeliveryOutcome {
  ok: boolean;
  channel: DeliveryChannel;
  summary: string;
}

/** Where the Assistant's button points. NEXT_PUBLIC_NEXUS_URL wins, then the caller's host. */
export function checkDetailsUrl(origin: string | null | undefined): string {
  return `${shareBaseUrl(origin || 'https://nexus.neramclasses.com')}${CHECK_DETAILS_PATH}`;
}

/**
 * Send one queued check and write back how it went. Never throws for a delivery
 * problem: a send that reached nobody counts an attempt and leaves the row
 * queued, so the cron tries again.
 */
export async function sendRecordCheck(supabase: any, check: RecordCheckRow, origin: string | null): Promise<DeliveryOutcome> {
  let channel: DeliveryChannel = 'failed';
  try {
    const { counts } = await sendNudge({
      studentIds: [check.user_id],
      subject: CHECK_MESSAGE.subject,
      plain: CHECK_MESSAGE.plain,
      teamsText: CHECK_MESSAGE.teamsText,
      eventType: 'fee_details_check',
      metadata: { href: CHECK_DETAILS_PATH, check_id: check.id, source: 'record_check' },
      assistant: { link: { url: checkDetailsUrl(origin), label: CHECK_MESSAGE.linkLabel } },
      reachNotStarted: true,
      source: { kind: 'record_check', refId: check.id },
    });
    channel = deliveryChannel(counts);
  } catch (err) {
    console.error('[record-check] send threw:', err instanceof Error ? err.message : err);
    channel = 'failed';
  }

  if (deliveryLanded(channel)) {
    await markRecordCheckSent(supabase, check, channel);
  } else {
    await markRecordCheckAttemptFailed(supabase, check, channel);
  }
  return { ok: deliveryLanded(channel), channel, summary: deliverySummary(channel) };
}

/** Load a check by id and send it, or say why not. */
export async function sendRecordCheckById(
  supabase: any,
  checkId: string,
  origin: string | null,
): Promise<{ status: 200 | 404 | 409; body: Record<string, unknown> }> {
  const check = await getRecordCheck(supabase, checkId);
  if (!check) return { status: 404, body: { error: 'No such check.' } };
  if (check.status !== 'queued') {
    return { status: 409, body: { error: `This check is already ${check.status}.`, status: check.status } };
  }
  const outcome = await sendRecordCheck(supabase, check, origin);
  return { status: 200, body: { ok: outcome.ok, channel: outcome.channel, summary: outcome.summary } };
}

/** The office accepted or rejected a student's fee report: tell the student. */
export async function sendCorrectionResolution(
  report: FeeCorrectionReportRow,
  origin: string | null,
): Promise<DeliveryOutcome> {
  const copy = resolutionMessage(report);
  let channel: DeliveryChannel = 'failed';
  try {
    const { counts } = await sendNudge({
      studentIds: [report.user_id],
      subject: copy.subject,
      plain: copy.plain,
      eventType: 'fee_correction_resolved',
      metadata: { href: CHECK_DETAILS_PATH, report_id: report.id, outcome: report.status, source: 'record_check' },
      assistant: { link: { url: checkDetailsUrl(origin), label: CHECK_MESSAGE.linkLabel } },
      reachNotStarted: true,
      source: { kind: 'fee_correction', refId: report.id },
    });
    channel = deliveryChannel(counts);
  } catch (err) {
    console.error('[record-check] resolution send threw:', err instanceof Error ? err.message : err);
  }
  return { ok: deliveryLanded(channel), channel, summary: deliverySummary(channel) };
}
