/**
 * "Not now, try later" on the demo desk: the family asked us to wait (exam
 * pressure, the child is busy, "I will call you"). The request is parked with a
 * date and a note, leaves the working tabs, and comes back on that date: the
 * staff member who parked it gets a Neram Assistant reminder (the existing
 * call-back reminder), the family gets one email when we have an address, and
 * the panel offers the same words for staff to send on WhatsApp by hand
 * (automatic WhatsApp is held while the WABA block lasts).
 *
 * Pure: dates, wording and who the email goes to. The route and the cron do
 * the writes.
 */

import type { DemoRequest } from '@neram/database';
import { formatDemoDate, istDateKey, istDateTime } from '@neram/database/demo-schedule';

export type LaterPreset = '1m' | '3m' | 'exam' | 'custom';

export const LATER_PRESETS: Array<{ id: LaterPreset; label: string }> = [
  { id: '1m', label: 'In 1 month' },
  { id: '3m', label: 'In 3 months' },
  { id: 'exam', label: 'Near the exam' },
  { id: 'custom', label: 'Pick a date' },
];

/** Exam season check-in: 1 December, a few weeks before JEE and the NATA rush. */
const EXAM_MONTH = 12;
const EXAM_DAY = 1;

/** The call-back reminder and the family email go at 10 am IST on the chosen day. */
const LATER_HHMM = '10:00';

const pad = (n: number) => String(n).padStart(2, '0');

function addMonths(dateKey: string, months: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month = (total % 12) + 1;
  // 31 Jan + 1 month is 28/29 Feb, not 3 March.
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad(month)}-${pad(Math.min(d, last))}`;
}

/** The IST date a preset means, as YYYY-MM-DD. Null for 'custom' (staff pick it). */
export function laterDateFor(preset: LaterPreset, now: Date): string | null {
  const today = istDateKey(now);
  switch (preset) {
    case '1m':
      return addMonths(today, 1);
    case '3m':
      return addMonths(today, 3);
    case 'exam': {
      const year = Number(today.slice(0, 4));
      const thisYear = `${year}-${pad(EXAM_MONTH)}-${pad(EXAM_DAY)}`;
      return thisYear > today ? thisYear : `${year + 1}-${pad(EXAM_MONTH)}-${pad(EXAM_DAY)}`;
    }
    default:
      return null;
  }
}

/** Why a chosen date cannot be used, or null. Tomorrow at the earliest, a year at the most. */
export function laterDateError(dateKey: string, now: Date): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return 'Pick the date to try again.';
  const today = istDateKey(now);
  if (dateKey <= today) return 'Pick a date after today.';
  if (dateKey > addMonths(today, 12)) return 'Pick a date within a year.';
  return null;
}

/** The instant the reminder and the email go: 10 am IST on that day. */
export function laterContactAt(dateKey: string): Date {
  return istDateTime(dateKey, LATER_HHMM);
}

/** "Mon, 23 Nov" for the desk and the activity log. */
export function formatLaterDate(at: string | Date): string {
  return formatDemoDate(typeof at === 'string' ? new Date(at) : at);
}

type LaterFields = Pick<DemoRequest, 'status' | 'last_call_outcome' | 'next_contact_at'>;

/** Parked and not due yet: it sits on the Later tab. */
export function isParkedLater(r: LaterFields, now: Date): boolean {
  return (
    r.status === 'contacted' &&
    r.last_call_outcome === 'later' &&
    !!r.next_contact_at &&
    new Date(r.next_contact_at).getTime() > now.getTime()
  );
}

function firstName(name: string | null | undefined): string {
  const n = (name || '').trim().split(/\s+/)[0] || '';
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : '';
}

/**
 * Who the family email goes to: the parent when the account is the parent's
 * (they asked us to wait), else the student, else whichever address we have.
 */
export function laterEmailRecipient(
  r: Pick<DemoRequest, 'email' | 'parent_email' | 'account_holder'>,
): string | null {
  const student = r.email?.trim() || null;
  const parent = r.parent_email?.trim() || null;
  return r.account_holder === 'parent' ? parent || student : student || parent;
}

function demoBookingUrl(marketingOrigin: string): string {
  return `${marketingOrigin.replace(/\/+$/, '')}/demo-class`;
}

/** The words for the family, shared by the WhatsApp copy and the email. */
export function laterFamilyMessage(
  r: Pick<DemoRequest, 'name' | 'parent_name' | 'account_holder'>,
  marketingOrigin: string,
): string {
  const student = firstName(r.name);
  const toParent = r.account_holder === 'parent';
  const hello = toParent ? `Hello${r.parent_name ? ` ${firstName(r.parent_name)}` : ''}` : `Hi${student ? ` ${student}` : ''}`;
  const whose = toParent && student ? `${student}'s free NATA and JEE Paper 2 demo class` : 'your free NATA and JEE Paper 2 demo class';
  return (
    `${hello}, this is Neram Classes. You had asked us to check back about ${whose}. ` +
    `Is this a better time? Pick a slot here: ${demoBookingUrl(marketingOrigin)} ` +
    'or reply to this message and we will fix a time that suits you.'
  );
}

function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const FONT = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const INK = '#202124';
const MUTED = '#5F6368';
const LINE = '#DADCE0';
const BRAND = '#1565C0';

/** The one family email on the try-again date. Email-safe: tables and inline styles. */
export function buildLaterEmail(
  r: Pick<DemoRequest, 'name' | 'parent_name' | 'account_holder'>,
  marketingOrigin: string,
): { subject: string; text: string; html: string } {
  const student = firstName(r.name);
  const toParent = r.account_holder === 'parent';
  const text = laterFamilyMessage(r, marketingOrigin);
  const booking = esc(demoBookingUrl(marketingOrigin));
  const hello = esc(text.split(',')[0]);
  const whose = toParent && student ? `${esc(student)}&#39;s free demo class` : 'your free demo class';
  const p = (html: string, extra = '') =>
    `<p style="margin:0 0 16px 0;font-family:${FONT};font-size:16px;line-height:24px;color:${INK};${extra}">${html}</p>`;
  const html = [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;border-collapse:collapse;">`,
    `<tr><td style="padding:4px 0 24px 0;font-family:${FONT};"><span style="font-size:20px;line-height:24px;font-weight:700;color:${BRAND};">Neram Classes</span></td></tr>`,
    '<tr><td>' +
      p(`${hello},`) +
      p(`You had asked us to check back about ${whose}. Is this a better time?`) +
      p(
        'It is a live NATA and JEE Paper 2 class on Microsoft Teams with our architect faculty. Parents are welcome to join and ask anything about the course and the fees.',
      ) +
      '</td></tr>',
    '<tr><td style="padding:0 0 20px 0;">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr>' +
      `<td bgcolor="${BRAND}" style="border-radius:6px;background:${BRAND};">` +
      `<a href="${booking}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;line-height:20px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:6px;">Pick a demo slot</a>` +
      '</td></tr></table></td></tr>',
    '<tr><td>' + p('Or simply reply to this email and we will fix a time that suits you.', `color:${MUTED};`) + '</td></tr>',
    `<tr><td style="padding:16px 0 8px 0;border-top:1px solid ${LINE};font-family:${FONT};font-size:13px;line-height:20px;color:${MUTED};">` +
      `Call or WhatsApp us on <a href="tel:+919176137043" style="color:${BRAND};text-decoration:none;">+91 91761 37043</a>.<br/>` +
      'You are receiving this because you asked us to check back about a free demo class at neramclasses.com.' +
      '</td></tr>',
    '</table>',
  ].join('\n');
  const subject = toParent && student ? `${student}'s free demo class: is this a better time?` : 'Your free demo class: is this a better time?';
  return { subject, text, html };
}
