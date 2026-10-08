/**
 * Teams meetings for Demo Class v2, created app-only on the host's calendar.
 *
 * A calendar event (not a bare onlineMeeting) is what we want: Exchange then
 * emails the student's Gmail a real invite with an .ics, keeps it in the host's
 * Outlook and Teams calendar, and sends an update or cancellation by itself when
 * the event is patched or cancelled.
 *
 * Needs the Microsoft Graph APPLICATION permission Calendars.ReadWrite (admin
 * consented) on the app behind AZ_CLIENT_ID. DEMO_TEAMS_DRY_RUN=true skips
 * Graph entirely and returns a fake link, for local, staging and E2E.
 */

import { getAppOnlyToken } from '@neram/auth';

const GRAPH = 'https://graph.microsoft.com/v1.0';

/** Outlook category on every demo. Create it once per mailbox (Categorize > New) to give it a colour. */
export const DEMO_CATEGORY = 'Neram Demo';

export interface DemoEventInput {
  organizerUpn: string;
  subject: string;
  /** HTML body shown in the invite. */
  bodyHtml: string;
  start: Date;
  minutes: number;
  attendees: Array<{ email: string; name: string }>;
}

export interface DemoEventResult {
  eventId: string;
  joinUrl: string;
}

export class DemoTeamsError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function isDemoTeamsDryRun(): boolean {
  return process.env.DEMO_TEAMS_DRY_RUN === 'true';
}

/** Graph wants a wall-clock string plus a zone; UTC keeps it unambiguous. */
function graphTime(d: Date) {
  return { dateTime: d.toISOString().replace('Z', ''), timeZone: 'UTC' };
}

export function buildDemoEventPayload(input: DemoEventInput) {
  const end = new Date(input.start.getTime() + input.minutes * 60_000);
  return {
    subject: input.subject,
    body: { contentType: 'HTML', content: input.bodyHtml },
    start: graphTime(input.start),
    end: graphTime(end),
    attendees: input.attendees.map((a) => ({ emailAddress: { address: a.email, name: a.name }, type: 'required' })),
    isOnlineMeeting: true,
    onlineMeetingProvider: 'teamsForBusiness',
    allowNewTimeProposals: false,
    // Colours the event in Outlook once a "Neram Demo" category exists there.
    categories: [DEMO_CATEGORY],
    isReminderOn: true,
    reminderMinutesBeforeStart: 15,
    showAs: 'busy',
  };
}

function tokenRoles(token: string): string[] {
  try {
    const payload = token.split('.')[1] ?? '';
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const roles = JSON.parse(json).roles;
    return Array.isArray(roles) ? roles : [];
  } catch {
    return [];
  }
}

async function graph(path: string, init: RequestInit & { token: string }): Promise<Response> {
  return fetch(`${GRAPH}${path}`, {
    ...init,
    cache: 'no-store',
    headers: { Authorization: `Bearer ${init.token}`, 'Content-Type': 'application/json' },
  });
}

/** Turn a Graph refusal into a message staff can act on. */
async function explain(res: Response, token: string, upn: string): Promise<DemoTeamsError> {
  const body = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
  const detail = body.error?.message || `HTTP ${res.status}`;
  if (res.status === 403 || res.status === 401) {
    const roles = tokenRoles(token);
    if (!roles.includes('Calendars.ReadWrite')) {
      return new DemoTeamsError(
        'The Microsoft app cannot write calendars yet. In Azure portal > App registrations > (the app behind AZ_CLIENT_ID) > API permissions, add Microsoft Graph > Application > Calendars.ReadWrite and grant admin consent.',
        403,
      );
    }
    return new DemoTeamsError(
      `Microsoft refused access to ${upn}'s calendar (${detail}). If an Exchange application access policy restricts the app, add this mailbox to it.`,
      403,
    );
  }
  if (res.status === 404) {
    return new DemoTeamsError(`No Microsoft mailbox found for ${upn}. Check the host's address in Demo settings.`, 400);
  }
  return new DemoTeamsError(`Teams meeting could not be saved: ${detail}`, 502);
}

export async function createDemoEvent(input: DemoEventInput, refForDryRun: string): Promise<DemoEventResult> {
  if (isDemoTeamsDryRun()) {
    return {
      eventId: `dry-run-${refForDryRun}-${Date.now()}`,
      joinUrl: `https://teams.microsoft.com/l/meetup-join/dry-run-${refForDryRun.toLowerCase()}`,
    };
  }
  const token = await getAppOnlyToken();
  const upn = encodeURIComponent(input.organizerUpn);
  const res = await graph(`/users/${upn}/events`, {
    token,
    method: 'POST',
    body: JSON.stringify(buildDemoEventPayload(input)),
  });
  if (!res.ok) throw await explain(res, token, input.organizerUpn);
  const event = (await res.json()) as { id: string; onlineMeeting?: { joinUrl?: string } | null };
  let joinUrl = event.onlineMeeting?.joinUrl ?? '';
  if (!joinUrl) {
    // Exchange occasionally fills the Teams link a moment after the create returns.
    await new Promise((r) => setTimeout(r, 1500));
    const again = await graph(`/users/${upn}/events/${encodeURIComponent(event.id)}?$select=onlineMeeting`, {
      token,
      method: 'GET',
    });
    if (again.ok) joinUrl = ((await again.json()) as { onlineMeeting?: { joinUrl?: string } }).onlineMeeting?.joinUrl ?? '';
  }
  if (!joinUrl) {
    throw new DemoTeamsError(
      'The calendar event was created but Teams did not attach a meeting link. Check that the host has a Teams licence.',
      502,
    );
  }
  return { eventId: event.id, joinUrl };
}

/** Move the meeting; Exchange emails the updated invite to every attendee. */
export async function rescheduleDemoEvent(
  organizerUpn: string,
  eventId: string,
  start: Date,
  minutes: number,
): Promise<void> {
  if (isDemoTeamsDryRun() || eventId.startsWith('dry-run-')) return;
  const token = await getAppOnlyToken();
  const end = new Date(start.getTime() + minutes * 60_000);
  const res = await graph(`/users/${encodeURIComponent(organizerUpn)}/events/${encodeURIComponent(eventId)}`, {
    token,
    method: 'PATCH',
    body: JSON.stringify({ start: graphTime(start), end: graphTime(end) }),
  });
  if (!res.ok) throw await explain(res, token, organizerUpn);
}

/** Cancel the meeting; Exchange emails a cancellation to every attendee. */
export async function cancelDemoEvent(organizerUpn: string, eventId: string, comment: string): Promise<void> {
  if (isDemoTeamsDryRun() || eventId.startsWith('dry-run-')) return;
  const token = await getAppOnlyToken();
  const res = await graph(
    `/users/${encodeURIComponent(organizerUpn)}/events/${encodeURIComponent(eventId)}/cancel`,
    { token, method: 'POST', body: JSON.stringify({ comment }) },
  );
  // Already gone counts as cancelled.
  if (!res.ok && res.status !== 404) throw await explain(res, token, organizerUpn);
}

export interface BusyBlock {
  start: string;
  end: string;
  /** busy, tentative, oof (out of office), workingElsewhere */
  status: string;
}

/**
 * Free/busy for the demo team over one window (a day), from their Outlook
 * calendars. Only times and status, never subjects. Calendars.Read (application).
 * Dry run returns nothing busy.
 */
export async function getTeamBusy(upns: string[], from: Date, to: Date): Promise<Record<string, BusyBlock[]>> {
  const out: Record<string, BusyBlock[]> = Object.fromEntries(upns.map((u) => [u, []]));
  if (!upns.length || isDemoTeamsDryRun()) return out;
  const token = await getAppOnlyToken();
  const res = await graph(`/users/${encodeURIComponent(upns[0])}/calendar/getSchedule`, {
    token,
    method: 'POST',
    body: JSON.stringify({
      schedules: upns,
      startTime: graphTime(from),
      endTime: graphTime(to),
      availabilityViewInterval: 15,
    }),
  });
  if (!res.ok) throw await explain(res, token, upns[0]);
  const body = (await res.json()) as {
    value?: Array<{ scheduleId: string; scheduleItems?: Array<{ status: string; start: { dateTime: string }; end: { dateTime: string } }> }>;
  };
  for (const s of body.value ?? []) {
    const key = upns.find((u) => u.toLowerCase() === s.scheduleId.toLowerCase()) ?? s.scheduleId;
    out[key] = (s.scheduleItems ?? [])
      .filter((i) => i.status !== 'free')
      .map((i) => ({
        start: graphUtc(i.start.dateTime),
        end: graphUtc(i.end.dateTime),
        status: i.status,
      }));
  }
  return out;
}

/**
 * getSchedule answers in the zone it was asked in (UTC) with no Z and seven
 * fractional digits ("2025-10-14T12:30:00.0000000"). Normalised to ISO.
 */
export function graphUtc(dateTime: string): string {
  const trimmed = dateTime.replace(/Z$/, '').replace(/(\.\d{3})\d+$/, '$1');
  return new Date(`${trimmed}Z`).toISOString();
}

/** The busy blocks that overlap [start, start + minutes). */
export function overlapping(blocks: BusyBlock[], start: Date, minutes: number): BusyBlock[] {
  const s = start.getTime();
  const e = s + minutes * 60_000;
  return blocks.filter((b) => new Date(b.start).getTime() < e && new Date(b.end).getTime() > s);
}
