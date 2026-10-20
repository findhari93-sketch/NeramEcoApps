/**
 * Applies the enrolment reminder plan (utils/enrolment-reminders.ts) once a
 * day: nudge emails with the payment details on day 1, day 3 and two days
 * before a link closes; expiry of dead links with an email to the student and
 * a bell for staff. Counters move only when an email actually went. One link
 * failing never stops the rest.
 */
import { planEnrolmentReminders, type ReminderLinkRow } from '../utils/enrolment-reminders';
import { offerFromLink, offerLines } from '../utils/student-pay';
import { enrolmentLinkUrl } from '../utils/enrolment-link';
import { formatDueDate, addDaysToKey, istToday } from '../utils/fee-plan';
import { getPaymentPayee } from '../queries/payment-payee';
import { logDirectEnrollmentLinkEvent } from '../queries/direct-enrollment';
import { createAdminNotification } from '../queries/notifications';
import { sendEnrolmentReminderEmail, sendLinkExpiredEmail } from './enrolment-payment-email';

const COURSE_LABELS: Record<string, string> = {
  nata: 'NATA coaching',
  jee_paper2: 'JEE Paper 2 coaching',
  both: 'NATA + JEE Paper 2 coaching',
};

export interface ReminderRunResult {
  reminded: number;
  expired: number;
  skipped: number;
  failed: number;
}

export async function runEnrolmentReminders(supabase: any, opts: { siteUrl: string; now?: Date }): Promise<ReminderRunResult> {
  const now = opts.now || new Date();
  const siteUrl = opts.siteUrl.replace(/\/+$/, '');
  const result: ReminderRunResult = { reminded: 0, expired: 0, skipped: 0, failed: 0 };

  const { data: links, error } = await supabase
    .from('direct_enrollment_links')
    .select('*')
    .eq('payment_mode', 'student_pays')
    .eq('status', 'active')
    .is('submitted_at', null);
  if (error) throw error;
  const rows: any[] = links || [];
  const byId = new Map(rows.map((l) => [l.id, l]));
  const plan = planEnrolmentReminders(rows as ReminderLinkRow[], now);

  // Links the validate route or the identity sweep already expired never passed
  // through the 'expire' branch below: give them their notices too, once.
  const { data: deadLinks, error: deadErr } = await supabase
    .from('direct_enrollment_links')
    .select('*')
    .eq('payment_mode', 'student_pays')
    .eq('status', 'expired')
    .is('submitted_at', null);
  if (deadErr) throw deadErr;
  const dead: any[] = deadLinks || [];
  let noticed = new Set<string>();
  if (dead.length) {
    const { data: events, error: evErr } = await supabase
      .from('direct_enrollment_link_events')
      .select('link_id')
      .eq('kind', 'expired')
      .in('link_id', dead.map((l) => l.id));
    if (evErr) throw evErr;
    noticed = new Set((events || []).map((e: any) => e.link_id));
  }
  for (const l of dead) {
    if (!noticed.has(l.id)) {
      byId.set(l.id, l);
      plan.push({ linkId: l.id, action: 'expire' });
    }
  }
  if (!plan.length) return result;

  let payee: Awaited<ReturnType<typeof getPaymentPayee>> | null = null;

  for (const action of plan) {
    const link = byId.get(action.linkId);
    if (!link) continue;
    const studentName: string = link.student_name || 'Student';
    const courseLabel = COURSE_LABELS[link.interest_course] || 'Neram Classes coaching';
    const to: string | null = link.student_email || null;
    try {
      if (action.action === 'expire') {
        if (link.status === 'active') {
          const { data: closed, error: upErr } = await supabase
            .from('direct_enrollment_links')
            .update({ status: 'expired' })
            .eq('id', link.id)
            .eq('status', 'active')
            .select('id')
            .maybeSingle();
          if (upErr) throw upErr;
          // Someone else changed it (a payment landed, staff extended it): no notices.
          if (!closed) continue;
        }
        await logDirectEnrollmentLinkEvent(link.id, 'expired', null, { reason: 'unpaid', expires_at: link.expires_at }, supabase);
        if (to) {
          const sent = await sendLinkExpiredEmail(to, { studentName, courseLabel, whatsappHref: null }).catch((e: any) => ({ success: false, error: e?.message }));
          if (!sent.success) console.error('[enrolment-reminders] expiry email failed:', link.id, sent.error);
        }
        await createAdminNotification(
          {
            event_type: 'link_regeneration_requested',
            title: `Enrolment link expired unpaid: ${studentName}`,
            message: `${studentName}'s payment link closed without a payment. Extend it or send a new one.`,
            metadata: { kind: 'link_expired', link_id: link.id, url: `/direct-enrollment?highlight=${encodeURIComponent(link.id)}` },
          } as any,
          supabase,
        ).catch((e: any) => console.error('[enrolment-reminders] bell failed:', e?.message));
        result.expired += 1;
        continue;
      }

      if (!to) {
        result.skipped += 1;
        continue;
      }
      payee = payee || (await getPaymentPayee(supabase));
      const offer = offerFromLink(link);
      const scheme = link.chosen_scheme === 'installment' ? 'installment' : 'full';
      const sent = await sendEnrolmentReminderEmail(to, {
        stage: action.stage,
        studentName,
        courseLabel,
        offerLines: offerLines(offer, formatDueDate(addDaysToKey(istToday(now), Number(link.offer_balance_due_days) || 45))),
        payee,
        resumeUrl: enrolmentLinkUrl(link.token, siteUrl),
        qrPngUrl: `${siteUrl}/api/enroll/qr?token=${encodeURIComponent(link.token)}&scheme=${scheme}`,
        expiresLabel: formatDueDate(String(link.expires_at).slice(0, 10)),
      });
      if (!sent.success) {
        console.error('[enrolment-reminders] email refused:', link.id, (sent as any).error);
        result.failed += 1;
        continue;
      }
      const { data: counted, error: cntErr } = await supabase
        .from('direct_enrollment_links')
        .update({ reminder_count: (Number(link.reminder_count) || 0) + 1, last_reminder_at: now.toISOString() })
        .eq('id', link.id)
        .eq('reminder_count', Number(link.reminder_count) || 0)
        .select('id')
        .maybeSingle();
      if (cntErr) throw cntErr;
      if (!counted) {
        // A second run of the same tick got here first; it already counted and logged.
        result.reminded += 1;
        continue;
      }
      await logDirectEnrollmentLinkEvent(link.id, 'reminder_sent', null, { stage: action.stage, to }, supabase);
      if (action.stage !== 'day1') {
        await createAdminNotification(
          {
            event_type: 'link_regeneration_requested',
            title: `${action.stage === 'day3' ? 'Still unpaid' : 'Closing soon'}: ${studentName}`,
            message: `${studentName} has not paid on their enrolment link${action.stage === 'last_chance' ? ', and it closes in two days' : ''}. A call may help; you can also extend the link.`,
            metadata: { kind: 'reminder', stage: action.stage, link_id: link.id, url: `/direct-enrollment?highlight=${encodeURIComponent(link.id)}` },
          } as any,
          supabase,
        ).catch((e: any) => console.error('[enrolment-reminders] bell failed:', e?.message));
      }
      result.reminded += 1;
    } catch (e: any) {
      console.error('[enrolment-reminders] link failed:', action.linkId, e?.message);
      result.failed += 1;
    }
  }
  return result;
}
