/**
 * Neram Assistant reminders for the demo team (Demo Class v2).
 *
 * Admin and marketing queue rows in demo_request_messages with channel
 * 'assistant'; the Nexus cron (api/cron/demo-staff-reminders) sends them
 * through sendNudge, because Nexus owns the Teams bot. This file is the pure
 * part: whether a row should still go, and what it says.
 *
 * Demos never touch Nexus classes: the meetings live on staff calendars,
 * which Nexus does not read.
 */

import {
  formatDemoDateTime,
  formatDemoPreference,
  formatDemoTime,
  istDateKey,
  type DemoRequest,
  type DemoRequestMessage,
  type DemoScheduleSettings,
} from '@neram/database';

const CLASS_NAMES: Record<string, string> = {
  '10th': 'Class 10',
  '11th': 'Class 11',
  '12th': 'Class 12',
  '12th-pass': 'Drop year',
  other: 'Other',
};

function who(r: DemoRequest): string {
  const cls = r.current_class ? ` (${CLASS_NAMES[r.current_class] ?? r.current_class})` : '';
  return `${r.name}${cls}`;
}

function phone(p: string | null): string {
  const d = (p || '').replace(/\D/g, '').slice(-10);
  return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : p || '';
}

/** Null when the reminder should go; otherwise why it is skipped. */
export function staffReminderSkipReason(
  m: Pick<DemoRequestMessage, 'kind' | 'send_after'>,
  r: Pick<DemoRequest, 'status' | 'scheduled_start' | 'scheduled_minutes' | 'next_contact_at'>,
  now: Date,
): string | null {
  const late = now.getTime() - new Date(m.send_after).getTime();
  const start = r.scheduled_start ? new Date(r.scheduled_start) : null;
  switch (m.kind) {
    case 'staff_new_request':
      if (late > 12 * 60 * 60_000) return 'stale';
      return r.status === 'pending' ? null : `request is ${r.status}`;
    case 'staff_callback':
      if (late > 3 * 60 * 60_000) return 'stale';
      if (r.status !== 'contacted') return `request is ${r.status}`;
      if (!r.next_contact_at || Math.abs(new Date(r.next_contact_at).getTime() - new Date(m.send_after).getTime()) > 2 * 60_000) {
        return 'call-back time changed';
      }
      return null;
    case 'staff_day':
      if (r.status !== 'approved' || !start) return `request is ${r.status}`;
      if (istDateKey(start) !== istDateKey(new Date(m.send_after))) return 'demo moved to another day';
      if (now.getTime() > start.getTime()) return 'demo already started';
      return null;
    case 'staff_soon':
      if (r.status !== 'approved' || !start) return `request is ${r.status}`;
      if (now.getTime() > start.getTime() + r.scheduled_minutes * 60_000) return 'demo already over';
      return null;
    default:
      return 'not a staff reminder';
  }
}

export interface StaffNudge {
  subject: string;
  plain: string;
  link: { url: string; label: string };
}

export function buildStaffReminder(
  m: Pick<DemoRequestMessage, 'kind'>,
  r: DemoRequest,
  ctx: { tutorName: string | null; adminOrigin: string; schedule: DemoScheduleSettings },
): StaffNudge {
  const desk = { url: `${ctx.adminOrigin}/demo-classes?id=${encodeURIComponent(r.id)}`, label: 'Open the request' };
  const join = r.teams_join_url ? { url: r.teams_join_url, label: 'Join the demo' } : desk;
  const start = r.scheduled_start ? new Date(r.scheduled_start) : null;
  const parent = r.parent_joining ? ', with a parent' : '';
  const tutor = ctx.tutorName ? ` Tutor: ${ctx.tutorName}.` : '';
  const first = r.name.trim().split(/\s+/)[0];

  switch (m.kind) {
    case 'staff_new_request':
      return {
        subject: `New demo request: ${first}`,
        plain:
          `${who(r)} asked for a free demo: ${formatDemoPreference(r.preferred_date, r.preferred_window, ctx.schedule)}${parent}. ` +
          `Call ${phone(r.phone)} within 2 hours to fix the time. Ref ${r.ref_code}.`,
        link: desk,
      };
    case 'staff_callback':
      return {
        subject: `Call back now: ${first}`,
        plain: `Time to call ${who(r)} back about the free demo. ${phone(r.phone)}. Ref ${r.ref_code}.`,
        link: desk,
      };
    case 'staff_day':
      return {
        subject: `Demo today at ${start ? formatDemoTime(start) : ''}: ${first}`,
        plain: `${who(r)}${parent}, ${start ? formatDemoDateTime(start) : ''}.${tutor} Ref ${r.ref_code}.`,
        link: join,
      };
    case 'staff_soon':
    default:
      return {
        subject: `Demo starts in 15 minutes: ${first}`,
        plain:
          `${start ? formatDemoTime(start) : 'Soon'} with ${who(r)}${parent}. ` +
          `Students wait in the Teams lobby, so let them in when you join. Ref ${r.ref_code}.`,
        link: join,
      };
  }
}
