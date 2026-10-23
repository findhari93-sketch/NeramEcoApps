/**
 * The family side of "Try later": on the try-again date, one email to the
 * family when we have an address. Runs with the 5-minute demo-messages cron.
 * The staff side is the queued staff_callback reminder (Neram Assistant).
 *
 * later_nudged_at is set whatever happens (sent, no address, failed) so a
 * request is acted on once; the desk still offers the WhatsApp copy, and the
 * activity log says what happened.
 */

import { getSupabaseAdminClient, logDemoRequestEvent, type DemoRequest } from '@neram/database';
import { sendOutreachEmail } from '@/lib/college-outreach/send';
import { emailSkipReason } from '@/lib/college-accounts/invite';
import { buildLaterEmail, laterEmailRecipient } from './try-later';

export interface LaterNudgeSummary {
  emailed: number;
  noEmail: number;
  failed: number;
}

export async function sendDueLaterNudges(opts: { origin: string; now?: Date }): Promise<LaterNudgeSummary> {
  const supabase = getSupabaseAdminClient() as any;
  const now = opts.now ?? new Date();
  const summary: LaterNudgeSummary = { emailed: 0, noEmail: 0, failed: 0 };
  const { data, error } = await supabase
    .from('demo_class_registrations')
    .select('*')
    .eq('status', 'contacted')
    .eq('last_call_outcome', 'later')
    .is('later_nudged_at', null)
    .lte('next_contact_at', now.toISOString())
    .limit(20);
  if (error) throw error;

  for (const r of (data ?? []) as DemoRequest[]) {
    // Claim first, so an overlapping run never emails twice.
    const { data: claimed } = await supabase
      .from('demo_class_registrations')
      .update({ later_nudged_at: now.toISOString() })
      .eq('id', r.id)
      .is('later_nudged_at', null)
      .select('id');
    if (!claimed?.length) continue;

    const to = laterEmailRecipient(r);
    const skip = to ? emailSkipReason(to, Boolean(process.env.RESEND_API_KEY)) : 'no email on file';
    let note: string;
    let outcome: 'sent' | 'skipped' | 'failed';
    if (skip || !to) {
      outcome = 'skipped';
      note = `Try-again date reached. Family email not sent: ${skip}. Send the message on WhatsApp from the desk.`;
      summary.noEmail++;
    } else {
      const mail = buildLaterEmail(r, opts.origin);
      const result = await sendOutreachEmail({ to, subject: mail.subject, text: mail.text, html: mail.html });
      outcome = result.success ? 'sent' : 'failed';
      note = result.success
        ? `Try-again date reached. Emailed the family at ${to}.`
        : `Try-again date reached. Family email to ${to} failed: ${result.error ?? 'unknown error'}. Send the message on WhatsApp from the desk.`;
      if (result.success) summary.emailed++;
      else summary.failed++;
    }
    await logDemoRequestEvent({ registration_id: r.id, kind: 'message', outcome, note, actor_id: null }, supabase).catch(() => {});
  }
  return summary;
}
