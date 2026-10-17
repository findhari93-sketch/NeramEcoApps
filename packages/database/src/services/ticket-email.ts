/**
 * The one email a requester gets when their support ticket moves.
 *
 * Sent by the Admin ticket routes and the auto-close cron, never for internal
 * notes. The bell in the Tools App carries the same news; this reaches people
 * who are not in the app. WhatsApp is deliberately not used (sends are held).
 *
 * buildTicketUpdateEmail is pure so the copy can be tested.
 */

import { sendEmail } from './email';

export type TicketUpdateKind = 'reply' | 'info_requested' | 'resolved' | 'closed' | 'auto_closed';

export interface TicketUpdateEmailInput {
  kind: TicketUpdateKind;
  to: string;
  name: string;
  ticketNumber: string;
  subject: string;
  /** The staff message, resolution note or close note. Plain text, escaped here. */
  message?: string | null;
  /** Name of the staff member, shown as "Hari from Neram". */
  staffName?: string | null;
  /** Outcome label for closed tickets, e.g. "Fixed". */
  outcomeLabel?: string | null;
  /** Link to the ticket in the Tools App. Absent for requesters with no account. */
  ticketUrl?: string | null;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function firstName(name: string): string {
  return (name || '').trim().split(/\s+/)[0] || 'there';
}

const COPY: Record<TicketUpdateKind, { subject: (n: string) => string; lead: string; button: string }> = {
  reply: {
    subject: (n) => `New reply on your support ticket ${n}`,
    lead: 'We replied to your support ticket.',
    button: 'Open the ticket',
  },
  info_requested: {
    subject: (n) => `We need a little more from you (${n})`,
    lead: 'To keep working on your ticket, we need a reply from you. If we do not hear back in 7 days, the ticket closes on its own.',
    button: 'Reply to us',
  },
  resolved: {
    subject: (n) => `Your support ticket ${n} is resolved`,
    lead: 'We think this is fixed. Please check and tell us if it works. If we do not hear back in 3 days, the ticket closes on its own.',
    button: 'Check and confirm',
  },
  closed: {
    subject: (n) => `Your support ticket ${n} is closed`,
    lead: 'We have closed your support ticket. If the problem comes back within 7 days, open the ticket and tap Still happening.',
    button: 'View the ticket',
  },
  auto_closed: {
    subject: (n) => `Your support ticket ${n} was closed`,
    lead: 'Your support ticket closed on its own because we did not hear back. If you still need help, open the ticket and tap Still happening, or raise a new one.',
    button: 'View the ticket',
  },
};

export function buildTicketUpdateEmail(input: TicketUpdateEmailInput): { subject: string; html: string } {
  const copy = COPY[input.kind];
  const message = input.message?.trim();
  const from = input.staffName ? `${escapeHtml(firstName(input.staffName))} from Neram` : 'Neram Support';

  const messageBlock = message
    ? `<div style="background:#ffffff;border:1px solid #e0e0e0;border-radius:8px;padding:16px;margin:16px 0;">
         <div style="font-size:13px;color:#555;margin-bottom:6px;">${from}</div>
         <div style="white-space:pre-wrap;color:#1a1a1a;">${escapeHtml(message)}</div>
       </div>`
    : '';

  const outcome = input.outcomeLabel
    ? `<p style="margin:8px 0;color:#333;"><strong>Outcome:</strong> ${escapeHtml(input.outcomeLabel)}</p>`
    : '';

  const action = input.ticketUrl
    ? `<p style="margin:24px 0;"><a href="${escapeHtml(input.ticketUrl)}" style="display:inline-block;background:#1565C0;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">${copy.button}</a></p>`
    : `<p style="margin:16px 0;color:#333;">To reply, call us at +91 9176137043 and mention ${escapeHtml(input.ticketNumber)}.</p>`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;background:#f4f6f8;font-family:'Segoe UI',Arial,sans-serif;line-height:1.6;color:#1a1a1a;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <div style="background:#ffffff;border-radius:10px;padding:24px;">
      <div style="font-family:'Courier New',monospace;font-size:13px;color:#1565C0;font-weight:700;">${escapeHtml(input.ticketNumber)}</div>
      <h1 style="font-size:20px;margin:6px 0 16px;">${escapeHtml(input.subject)}</h1>
      <p style="margin:0 0 8px;">Hi ${escapeHtml(firstName(input.name))},</p>
      <p style="margin:0 0 8px;">${copy.lead}</p>
      ${outcome}
      ${messageBlock}
      ${action}
    </div>
    <p style="text-align:center;font-size:12px;color:#666;margin-top:16px;">Neram Classes. Architecture entrance coaching.</p>
  </div>
</body>
</html>`;

  return { subject: copy.subject(input.ticketNumber), html };
}

/** Send it. Never throws: a failed email must not fail the move that caused it. */
export async function sendTicketUpdateEmail(input: TicketUpdateEmailInput): Promise<boolean> {
  if (!input.to || !process.env.RESEND_API_KEY) return false;
  try {
    const { subject, html } = buildTicketUpdateEmail(input);
    const result = await sendEmail({ to: input.to, subject, html });
    return result.success;
  } catch (err) {
    console.error('[ticket-email] send failed:', err);
    return false;
  }
}
