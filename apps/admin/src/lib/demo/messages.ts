/**
 * What a queued demo WhatsApp says, and whether it should still go.
 *
 * Pure: the cron loads the request and the host, this decides. Parameters are
 * built at send time so a reschedule, a rename or a parent number added after
 * the request is reflected in what actually goes out.
 */

import {
  formatDemoDateTime,
  formatDemoPreference,
  formatDemoTime,
  type DemoScheduleSettings,
  type DemoWaParams,
  type DemoRequest,
  type DemoRequestMessage,
} from '@neram/database';

const STALE_MS = 6 * 60 * 60 * 1000;

function firstName(name: string | null | undefined): string {
  const n = (name || '').trim().split(/\s+/)[0] || '';
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : '';
}

/** Null when the message should be sent; otherwise why it is skipped. */
export function demoMessageSkipReason(
  message: Pick<DemoRequestMessage, 'kind' | 'send_after'>,
  request: Pick<DemoRequest, 'status' | 'scheduled_start' | 'scheduled_minutes' | 'join_token'>,
  now: Date,
): string | null {
  if (now.getTime() - new Date(message.send_after).getTime() > STALE_MS) return 'stale: due more than 6 hours ago';
  const start = request.scheduled_start ? new Date(request.scheduled_start) : null;
  switch (message.kind) {
    case 'received':
      return request.status === 'pending' || request.status === 'contacted' ? null : `request is ${request.status}`;
    case 'confirmed':
    case 'rescheduled':
    case 'reminder_day':
    case 'reminder_soon':
      if (request.status !== 'approved') return `request is ${request.status}`;
      if (!start || !request.join_token) return 'no confirmed time';
      if (now.getTime() > start.getTime() + request.scheduled_minutes * 60_000) return 'demo already over';
      if (message.kind === 'reminder_soon' && now.getTime() > start.getTime()) return 'demo already started';
      return null;
    case 'cancelled':
      return request.status === 'cancelled' ? null : `request is ${request.status}`;
    case 'thanks':
      return request.status === 'attended' ? null : `request is ${request.status}`;
    case 'missed':
      return request.status === 'no_show' ? null : `request is ${request.status}`;
    default:
      return 'unknown kind';
  }
}

export function buildDemoMessageParams(input: {
  request: DemoRequest;
  recipient: 'student' | 'parent';
  hostName: string | null;
  schedule: DemoScheduleSettings;
  marketingOrigin: string;
}): DemoWaParams {
  const { request: r, recipient } = input;
  const student = firstName(r.name) || 'there';
  const start = r.scheduled_start ? new Date(r.scheduled_start) : null;
  return {
    recipientName: recipient === 'student' ? student : firstName(r.parent_name) || 'Parent',
    studentName: recipient === 'student' ? 'you' : student,
    ref: r.ref_code || '',
    preference: formatDemoPreference(r.preferred_date, r.preferred_window, input.schedule),
    when: start ? formatDemoDateTime(start) : formatDemoPreference(r.preferred_date, r.preferred_window, input.schedule),
    time: start ? formatDemoTime(start) : '',
    hostName: input.hostName || 'our architect faculty',
    reason: (r.status === 'cancelled' ? r.cancel_reason : r.schedule_change_reason) || '',
    token: r.join_token || '',
    surveyUrl: `${input.marketingOrigin}/demo-class/survey/${r.id}`,
  };
}

function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Email-safe styling: tables and inline styles only, since Exchange keeps the
// body but Gmail and Outlook drop <style> blocks. Colours follow @neram/ui.
const FONT = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const INK = '#202124';
const MUTED = '#5F6368';
const LINE = '#DADCE0';
const BRAND = '#1565C0';

function step(n: number, title: string, body: string): string {
  return (
    '<tr>' +
    '<td width="40" valign="top" style="padding:0 0 18px 0;">' +
    `<div style="width:28px;height:28px;line-height:28px;border-radius:14px;background:#E8F0FE;color:${BRAND};` +
    `font-size:14px;font-weight:700;text-align:center;font-family:${FONT};">${n}</div></td>` +
    `<td valign="top" style="padding:3px 0 18px 0;font-family:${FONT};">` +
    `<div style="font-size:16px;line-height:22px;font-weight:600;color:${INK};">${title}</div>` +
    `<div style="font-size:15px;line-height:22px;color:${MUTED};padding-top:2px;">${body}</div>` +
    '</td></tr>'
  );
}

function detail(label: string, value: string, last = false): string {
  const border = last ? '' : `border-bottom:1px solid ${LINE};`;
  return (
    '<tr>' +
    `<td width="116" valign="top" style="padding:12px 0 12px 16px;${border}font-family:${FONT};font-size:14px;line-height:20px;color:${MUTED};">${label}</td>` +
    `<td valign="top" style="padding:12px 16px 12px 8px;${border}font-family:${FONT};font-size:15px;line-height:20px;color:${INK};font-weight:600;">${value}</td>` +
    '</tr>'
  );
}

/**
 * The invite body Exchange sends to the student's Gmail (and the team's Outlook).
 * Exchange appends the Teams join block below it. The date and time stay out of
 * the body on purpose: a reschedule only patches start and end, and the invite
 * card above the body always shows the current time.
 */
export function buildDemoInviteHtml(input: {
  studentName: string;
  hostName: string;
  ref: string;
  myDemoUrl: string;
  drawingLink: string;
}): string {
  const name = esc(firstName(input.studentName) || 'there');
  const host = esc(input.hostName);
  const myDemo = esc(input.myDemoUrl);
  const p = (html: string, extra = '') =>
    `<p style="margin:0 0 16px 0;font-family:${FONT};font-size:16px;line-height:24px;color:${INK};${extra}">${html}</p>`;
  const h2 = (text: string) =>
    `<h2 style="margin:0 0 14px 0;font-family:${FONT};font-size:18px;line-height:24px;font-weight:600;color:${INK};">${text}</h2>`;
  const divider = `<tr><td style="padding:8px 0 24px 0;"><div style="height:1px;line-height:1px;background:${LINE};">&nbsp;</div></td></tr>`;

  return [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;border-collapse:collapse;">`,

    // Wordmark and status
    `<tr><td style="padding:4px 0 24px 0;font-family:${FONT};">` +
      `<span style="font-size:20px;line-height:24px;font-weight:700;color:${BRAND};">Neram Classes</span></td></tr>`,
    `<tr><td style="padding:0 0 12px 0;font-family:${FONT};">` +
      '<span style="display:inline-block;padding:4px 12px;border-radius:12px;background:#E6F4EA;color:#137333;font-size:13px;line-height:18px;font-weight:700;">Demo class confirmed</span></td></tr>',
    `<tr><td style="padding:0 0 12px 0;"><h1 style="margin:0;font-family:${FONT};font-size:24px;line-height:32px;font-weight:600;color:${INK};">You&#39;re all set, ${name}</h1></td></tr>`,
    '<tr><td>' +
      p(
        `Your free NATA and JEE Paper 2 demo class with ${host} is booked. It&#39;s a live class on Microsoft Teams, ` +
          'so you&#39;ll see exactly how a Neram class runs, take a tour of the Nexus app and try the AI tutor that helps you any time of day.',
      ) +
      '</td></tr>',

    // Details card
    '<tr><td style="padding:0 0 24px 0;">' +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;border:1px solid ${LINE};border-radius:8px;background:#F8F9FA;">` +
      detail('Teacher', host) +
      detail('Where', 'Live on Microsoft Teams') +
      detail('Date and time', 'Shown at the top of this invite') +
      detail('Who can join', 'You and your parents') +
      detail('Booking ID', esc(input.ref || 'Not set'), true) +
      '</table></td></tr>',

    // Primary action
    '<tr><td style="padding:0 0 12px 0;">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr>' +
      `<td bgcolor="${BRAND}" style="border-radius:6px;background:${BRAND};">` +
      `<a href="${myDemo}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;line-height:20px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:6px;">View booking and join link</a>` +
      '</td></tr></table></td></tr>',
    '<tr><td>' +
      p(
        'Your join link, calendar options and class details are always on this page. The Teams join link is also at the end of this invite.',
        `font-size:14px;line-height:20px;color:${MUTED};margin-bottom:24px;`,
      ) +
      '</td></tr>',
    divider,

    // How to join
    `<tr><td>${h2('How to join')}</td></tr>`,
    '<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">' +
      step(1, 'Use a steady internet connection', 'Wi-Fi or good mobile data keeps the video and sound clear.') +
      step(
        2,
        'On a laptop, join in your browser',
        'Open the join link in Chrome or Edge and choose <b>Continue on this browser</b>. Type your name and you&#39;re in. ' +
          'No download and no account needed. The Microsoft Teams app works too, if you already have it.',
      ) +
      step(
        3,
        'On a phone, use the Teams app',
        'Phones need the free Microsoft Teams app. Install it, tap the join link and choose <b>Join as a guest</b>. No sign-in needed.',
      ) +
      step(4, 'Join a couple of minutes early', 'It gives you time to check your sound. If you see a waiting screen, stay on and your teacher will let you in.') +
      '</table></td></tr>',
    divider,

    // Parents and drawings
    `<tr><td>${h2('Bring your parents along')}</td></tr>`,
    '<tr><td>' +
      p('Join together and ask us anything about the course, the exams or the fees. We&#39;ll answer every question live.', 'margin-bottom:24px;') +
      '</td></tr>',
    '<tr><td style="padding:0 0 28px 0;">' +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;border:1px solid ${LINE};border-radius:8px;">` +
      `<tr><td style="padding:16px;font-family:${FONT};">` +
      `<div style="font-size:16px;line-height:22px;font-weight:600;color:${INK};">Get feedback on a drawing</div>` +
      `<div style="font-size:15px;line-height:22px;color:${MUTED};padding:2px 0 10px 0;">Send us any drawing before the class and our faculty will share tips.</div>` +
      `<a href="${esc(input.drawingLink)}" target="_blank" style="font-size:15px;line-height:22px;font-weight:600;color:${BRAND};text-decoration:none;">Send a drawing on WhatsApp</a>` +
      '</td></tr></table></td></tr>',

    // Footer
    `<tr><td style="padding:16px 0 8px 0;border-top:1px solid ${LINE};font-family:${FONT};font-size:13px;line-height:20px;color:${MUTED};">` +
      `Can&#39;t make it, or have a question? Call or WhatsApp us on <a href="tel:+919176137043" style="color:${BRAND};text-decoration:none;">+91 91761 37043</a>.<br/>` +
      'You&#39;re receiving this because a free demo class was booked for you at neramclasses.com.<br/>' +
      `Neram Classes &middot; <a href="https://neramclasses.com" target="_blank" style="color:${MUTED};text-decoration:underline;">neramclasses.com</a>` +
      '</td></tr>',
    '</table>',
  ].join('\n');
}

const CLASS_NAMES: Record<string, string> = {
  '10th': 'Class 10',
  '11th': 'Class 11',
  '12th': 'Class 12',
  '12th-pass': 'Drop year',
  other: 'Other',
};

/** "Neram Demo · Priya R (Class 12) · DEMO-4K7Q": never mistaken for a class in Outlook or Teams. Mixed case on purpose: an all-caps subject reads as spam to filters and to people. */
export function demoEventSubject(r: Pick<DemoRequest, 'name' | 'current_class' | 'ref_code'>): string {
  const parts = r.name.trim().split(/\s+/);
  const first = firstName(parts[0]);
  const short = parts.length > 1 ? `${first} ${parts[parts.length - 1].charAt(0).toUpperCase()}` : first;
  const cls = r.current_class ? ` (${CLASS_NAMES[r.current_class] ?? r.current_class})` : '';
  return `Neram Demo · ${short}${cls}${r.ref_code ? ` · ${r.ref_code}` : ''}`;
}
