/**
 * Words for "Check your details": what the student is sent, and what staff are
 * told about how it went. PURE (no Supabase, no Graph), so it is unit tested and
 * shared by the internal route Admin calls, the daily cron and the student page.
 *
 * {firstName} is filled per recipient by sendNudge.
 */
import { formatDueDate, formatRupees } from '@neram/database/fee-plan';

/** The page every fee message links to. Ungated by feature flags on purpose. */
export const CHECK_DETAILS_PATH = '/student/check-details';

/** The bits of sendNudge's counts this file reads. */
export interface DeliveryCounts {
  chat: number;
  teams: number;
  inapp: number;
  skipped: number;
}

export type DeliveryChannel = 'chat' | 'teams' | 'inapp' | 'dormant' | 'failed';

/** One word for how a single-student send went, the best channel that landed. */
export function deliveryChannel(counts: DeliveryCounts): DeliveryChannel {
  if (counts.chat > 0) return 'chat';
  if (counts.teams > 0) return 'teams';
  if (counts.inapp > 0) return 'inapp';
  if (counts.skipped > 0) return 'dormant';
  return 'failed';
}

/** Did the student get it anywhere they will see? The bell counts. */
export function deliveryLanded(channel: DeliveryChannel): boolean {
  return channel === 'chat' || channel === 'teams' || channel === 'inapp';
}

/** The line staff read in Admin straight after pressing Send. */
export function deliverySummary(channel: DeliveryChannel): string {
  switch (channel) {
    case 'chat':
    case 'teams':
      return 'Sent in Teams.';
    case 'inapp':
      return 'Waiting in their Nexus bell.';
    case 'dormant':
      return 'Not sent: this student is paused.';
    default:
      return 'Not sent. Nexus will try again tomorrow.';
  }
}

/** The office has filled in the form and fees: please check them. */
export const CHECK_MESSAGE = {
  subject: 'Please check your details and fees',
  plain:
    'Hi {firstName}, the office has filled in your details and fees. ' +
    'Please check them. If a fee looks wrong, tell us on the same page.',
  teamsText: 'Please check your details and fees',
  linkLabel: 'Check your details',
} as const;

/** The office answered the student's "Something is wrong". */
export function resolutionMessage(report: { status: string; resolution_note?: string | null }): {
  subject: string;
  plain: string;
} {
  if (report.status === 'accepted') {
    return {
      subject: 'Your fees were updated',
      plain: 'Hi {firstName}, the office has updated your fees. Please check them again.',
    };
  }
  const note = (report.resolution_note || '').trim();
  return {
    subject: 'The office checked your fee report',
    plain:
      'Hi {firstName}, the office checked what you reported and kept your fees as they are.' +
      (note ? ` Their note: "${note}"` : '') +
      ' Please check them again.',
  };
}

/** The second installment reminder, 3 days before and on the day. */
export function installmentReminderMessage(input: {
  kind: 'upcoming' | 'due_today' | string;
  amount: number;
  dueDate: string;
}): { subject: string; plain: string; linkLabel: string } {
  const amount = formatRupees(input.amount);
  const when = input.kind === 'due_today' ? 'is due today' : `is due on ${formatDueDate(input.dueDate)}`;
  return {
    subject: input.kind === 'due_today' ? 'Your second installment is due today' : 'Your second installment is coming up',
    plain: `Hi {firstName}, your second installment of ${amount} ${when}. Tap Pay now to pay by UPI or bank transfer. Already paid at the office? You can ignore this.`,
    linkLabel: 'Pay now',
  };
}
