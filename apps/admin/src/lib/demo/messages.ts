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

/** The invite body Exchange sends to the student's Gmail. */
export function buildDemoInviteHtml(input: {
  studentName: string;
  hostName: string;
  ref: string;
  myDemoUrl: string;
  drawingLink: string;
}): string {
  return [
    `<p>Hi ${esc(firstName(input.studentName) || 'there')},</p>`,
    `<p>Your free Neram NATA / JEE Paper 2 demo class with ${esc(input.hostName)} is confirmed. ` +
      'It is a live class on Microsoft Teams: you will see how a real Neram class runs, get a tour of the Nexus app, ' +
      'and try the 24/7 AI tutor.</p>',
    '<p><b>Parents are welcome.</b> Join together and ask all your doubts about the course, the exams and the fees.</p>',
    '<p><b>Before the class</b></p>',
    '<ul>',
    '<li>Join from a laptop, or a phone with the Microsoft Teams app installed.</li>',
    '<li>Keep a pencil and a few sheets of paper ready.</li>',
    '<li>If Teams asks you to wait in the lobby, the teacher will let you in.</li>',
    '</ul>',
    `<p>Your booking, join link and calendar options: <a href="${esc(input.myDemoUrl)}">${esc(input.myDemoUrl)}</a></p>`,
    `<p>Want feedback on your drawings before the class? <a href="${esc(input.drawingLink)}">Send any drawing on WhatsApp</a>.</p>`,
    `<p>Reference: ${esc(input.ref)}<br/>Neram Classes, +91 91761 37043</p>`,
  ].join('\n');
}

const CLASS_NAMES: Record<string, string> = {
  '10th': 'Class 10',
  '11th': 'Class 11',
  '12th': 'Class 12',
  '12th-pass': 'Drop year',
  other: 'Other',
};

/** "NERAM DEMO · Priya R (Class 12) · DEMO-4K7Q": never mistaken for a class in Outlook or Teams. */
export function demoEventSubject(r: Pick<DemoRequest, 'name' | 'current_class' | 'ref_code'>): string {
  const parts = r.name.trim().split(/\s+/);
  const short = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1].charAt(0)}` : parts[0];
  const cls = r.current_class ? ` (${CLASS_NAMES[r.current_class] ?? r.current_class})` : '';
  return `NERAM DEMO · ${short}${cls}${r.ref_code ? ` · ${r.ref_code}` : ''}`;
}
