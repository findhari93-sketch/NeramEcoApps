import { Resend } from 'resend';

const FROM = 'Neram Classes <noreply@neramclasses.com>';

/** Addresses we never email: test accounts made by E2E runs and by staff trying things out. */
export function isTestEmail(email: string): boolean {
  return /@(neram\.test|example\.com|example\.org)$/i.test(email.trim());
}

export type SendResult = { sent: true } | { sent: false; reason: string };

/** Sends one dashboard email. Never throws: a failed email must not fail the action. */
export async function sendDashboardEmail(to: string, subject: string, html: string): Promise<SendResult> {
  if (isTestEmail(to)) return { sent: false, reason: 'test address' };
  if (!process.env.RESEND_API_KEY) return { sent: false, reason: 'email is not set up here' };
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({ from: FROM, to, subject, html });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: (e as Error).message || 'send failed' };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** A plain, Outlook-safe email: heading, a few lines, one button. */
export function simpleEmail(opts: { heading: string; lines: string[]; button?: { label: string; href: string }; footnote?: string }): string {
  const lines = opts.lines.map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#1f2937">${escapeHtml(l)}</p>`).join('');
  const button = opts.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0"><tr><td style="background:#1565c0;border-radius:8px"><a href="${escapeHtml(opts.button.href)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">${escapeHtml(opts.button.label)}</a></td></tr></table>`
    : '';
  const foot = opts.footnote ? `<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#6b7280">${escapeHtml(opts.footnote)}</p>` : '';
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f7fa;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb"><tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:20px;color:#111827">${escapeHtml(opts.heading)}</h1>${lines}${button}${foot}
<p style="margin:24px 0 0;font-size:12px;color:#9ca3af">Neram Classes, College Hub</p>
</td></tr></table></body></html>`;
}

/**
 * Origin for links in emails. The request's own origin first, so a staging
 * invite links to staging and a production one to neramclasses.com.
 */
export function siteOrigin(requestOrigin?: string | null): string {
  return (requestOrigin || process.env.NEXT_PUBLIC_MARKETING_URL || 'https://neramclasses.com').replace(/\/$/, '');
}
