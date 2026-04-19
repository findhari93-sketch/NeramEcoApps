import { sendOutreachEmail } from './send';

interface LeadEmailInput {
  collegeName: string;
  collegePageUrl: string;
  studentName: string;
  studentPhone: string;
  studentEmail?: string | null;
  studentCity?: string | null;
  studentNataScore?: number | null;
  studentMessage?: string | null;
  neramTier?: string | null;
}

function escape(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function maskPhone(phone: string): string {
  if (!phone || phone.length < 10) return phone;
  return `${phone.slice(0, 2)}XXXXXX${phone.slice(-2)}`;
}

export function renderLeadNotificationEmail(input: LeadEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const isGoldOrPlatinum = input.neramTier === 'gold' || input.neramTier === 'platinum';
  const displayPhone = isGoldOrPlatinum ? input.studentPhone : maskPhone(input.studentPhone);
  const phoneNote = isGoldOrPlatinum
    ? ''
    : '(Phone is partially hidden. Upgrade your plan or reply to this email to get full student contact details.)';

  const subject = `New student interest for ${input.collegeName}: ${input.studentName}`;

  const text = [
    `Hello,`,
    '',
    `A student has expressed interest in ${input.collegeName} through the Neram College Hub.`,
    '',
    'Student details:',
    `- Name: ${input.studentName}`,
    `- Phone: ${displayPhone}`,
    input.studentEmail ? `- Email: ${input.studentEmail}` : null,
    input.studentCity ? `- City: ${input.studentCity}` : null,
    typeof input.studentNataScore === 'number' ? `- NATA score: ${input.studentNataScore}/200` : null,
    input.studentMessage ? `- Message: ${input.studentMessage}` : null,
    '',
    phoneNote,
    '',
    'You can see this lead (and all future leads) on your Neram College Dashboard:',
    'https://neramclasses.com/college-dashboard/leads',
    '',
    `The student's public college page:`,
    input.collegePageUrl,
    '',
    'If you have not set up your dashboard login yet, reply to this email and we will send your access credentials.',
    '',
    'Warm regards,',
    'Neram Classes',
    'info@neramclasses.com',
  ]
    .filter((l): l is string => l !== null)
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${escape(subject)}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#1e293b;max-width:620px;margin:0 auto;padding:24px;background:#ffffff">
<p>Hello,</p>
<p>A student has expressed interest in <strong>${escape(input.collegeName)}</strong> through the Neram College Hub.</p>

<div style="border:1px solid #e2e8f0;border-radius:8px;padding:16px;background:#f8fafc;margin:16px 0">
  <h3 style="margin:0 0 12px 0;font-size:15px;color:#0f172a">Student details</h3>
  <table style="border-collapse:collapse;font-size:14px">
    <tr><td style="padding:4px 12px 4px 0;color:#475569;vertical-align:top">Name</td><td style="padding:4px 0"><strong>${escape(input.studentName)}</strong></td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#475569;vertical-align:top">Phone</td><td style="padding:4px 0"><strong>${escape(displayPhone)}</strong></td></tr>
    ${input.studentEmail ? `<tr><td style="padding:4px 12px 4px 0;color:#475569;vertical-align:top">Email</td><td style="padding:4px 0">${escape(input.studentEmail)}</td></tr>` : ''}
    ${input.studentCity ? `<tr><td style="padding:4px 12px 4px 0;color:#475569;vertical-align:top">City</td><td style="padding:4px 0">${escape(input.studentCity)}</td></tr>` : ''}
    ${typeof input.studentNataScore === 'number' ? `<tr><td style="padding:4px 12px 4px 0;color:#475569;vertical-align:top">NATA score</td><td style="padding:4px 0">${escape(input.studentNataScore)}/200</td></tr>` : ''}
    ${input.studentMessage ? `<tr><td style="padding:4px 12px 4px 0;color:#475569;vertical-align:top">Message</td><td style="padding:4px 0">${escape(input.studentMessage)}</td></tr>` : ''}
  </table>
  ${phoneNote ? `<p style="margin:12px 0 0 0;font-size:12px;color:#64748b">${escape(phoneNote)}</p>` : ''}
</div>

<p>You can see this lead (and all future leads) on your Neram College Dashboard:<br>
<a href="https://neramclasses.com/college-dashboard/leads" style="color:#2563eb">https://neramclasses.com/college-dashboard/leads</a></p>

<p>The student's public college page:<br>
<a href="${escape(input.collegePageUrl)}" style="color:#2563eb">${escape(input.collegePageUrl)}</a></p>

<p>If you have not set up your dashboard login yet, reply to this email and we will send your access credentials.</p>

<p style="margin-top:28px">Warm regards,<br>
Neram Classes<br>
<a href="mailto:info@neramclasses.com" style="color:#2563eb">info@neramclasses.com</a></p>
</body>
</html>`;

  return { subject, html, text };
}

interface SendLeadArgs extends LeadEmailInput {
  to: string;
}

export async function sendLeadNotificationToCollege(args: SendLeadArgs): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { subject, html, text } = renderLeadNotificationEmail(args);
  return sendOutreachEmail({
    to: args.to,
    subject,
    html,
    text,
    bcc: 'info@neramclasses.com',
  });
}
