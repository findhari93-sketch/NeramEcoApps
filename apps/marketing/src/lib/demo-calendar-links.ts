/**
 * "Add to calendar" targets for a confirmed demo. Google and Outlook open their
 * own add-event pages; Apple (and any other app) gets the .ics, which carries a
 * 30-minute reminder.
 */

import { googleCalendarUrl } from '@neram/database/demo-schedule';

export interface DemoCalendarInput {
  ref: string;
  token: string;
  start: Date;
  minutes: number;
  joinUrl: string | null;
  hostName?: string | null;
  /** Site origin for the booking page and .ics; '' keeps links relative. */
  origin: string;
}

const TITLE = 'Neram free demo class';

function details(e: DemoCalendarInput): string {
  const host = e.hostName ? ` with ${e.hostName}` : '';
  return `Live NATA and JEE Paper 2 demo class${host} on Microsoft Teams. Parents are welcome. Booking ${e.ref}.`;
}

function joinTarget(e: DemoCalendarInput): string {
  return e.joinUrl || `${e.origin || 'https://neramclasses.com'}/d/${e.token}`;
}

export function demoGoogleUrl(e: DemoCalendarInput): string {
  return googleCalendarUrl({ title: TITLE, start: e.start, minutes: e.minutes, details: details(e), url: joinTarget(e), uid: e.ref });
}

/** Outlook.com add-event page; personal and work accounts both land on it after sign-in. */
export function demoOutlookUrl(e: DemoCalendarInput): string {
  const end = new Date(e.start.getTime() + e.minutes * 60_000);
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: TITLE,
    startdt: e.start.toISOString(),
    enddt: end.toISOString(),
    body: `${details(e)}\n\nJoin: ${joinTarget(e)}`,
    location: 'Microsoft Teams',
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

export function demoIcsUrl(e: Pick<DemoCalendarInput, 'origin' | 'token'>): string {
  return `${e.origin}/api/demo-class/ics/${e.token}`;
}
