/**
 * Confirm a demo time: the panel's Confirm and Add demo's "Demo planned" both
 * come here. Server only.
 *
 * Meeting kinds:
 *   teams     Teams event on the organizer's calendar; the student gets the WhatsApp confirmation.
 *   own_link  staff's own Google Meet or Zoom link; staff tell the student themselves.
 *   later     time fixed, link added later from the panel.
 *   in_person at the centre, no link.
 * The approved WhatsApp templates promise a Microsoft Teams class, so only
 * 'teams' messages the student. Staff reminders go out for every kind.
 */
import {
  updateDemoRequest,
  logDemoRequestEvent,
  enqueueDemoMessages,
  enqueueDemoStaffMessages,
  staffUserIdsByUpn,
  staffReminderPlan,
  cancelPendingDemoMessages,
  demoReminderPlan,
  isOutsidePreference,
  formatDemoDateTime,
  drawingWhatsAppLink,
  pickDemoRoles,
  type DemoMeetingKind,
  type DemoRequest,
  type DemoSettings,
  type TypedSupabaseClient,
} from '@neram/database';
import { buildDemoInviteHtml, demoEventSubject } from './messages';
import { createDemoEvent, getTeamBusy, overlapping, isDemoTeamsDryRun } from './teams';

export class ConfirmError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export const MEETING_KINDS: DemoMeetingKind[] = ['teams', 'own_link', 'later', 'in_person'];

export interface ConfirmInput {
  start: Date;
  minutes: number;
  /** Told to the student when the time is outside what they asked for. */
  reason: string | null;
  /** Staff on this demo (lowercase UPNs); empty = the whole team. */
  teamUpns: string[];
  tutorUpn: string;
  organizerUpn: string;
  meeting: DemoMeetingKind;
  joinUrl: string | null;
  conflictNote: string | null;
  /** undefined keeps the request's parent email. */
  parentEmail?: string | null;
}

/** A pasted meeting link (Google Meet, Zoom, Teams): https only. */
export function meetingUrl(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim().slice(0, 500) : '';
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && u.hostname.includes('.') ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Old clients send 'link' for own link. */
export function parseMeetingKind(v: unknown): DemoMeetingKind {
  if (v === 'link') return 'own_link';
  return MEETING_KINDS.includes(v as DemoMeetingKind) ? (v as DemoMeetingKind) : 'teams';
}

async function enqueueStaffPlan(
  registrationId: string,
  start: Date,
  team: string[],
  tutorUpn: string | null,
  ids: Record<string, string>,
  supabase: TypedSupabaseClient,
): Promise<void> {
  const rows = staffReminderPlan(start, new Date(), team, tutorUpn)
    .filter((p) => ids[p.upn])
    .map((p) => ({ userId: ids[p.upn], kind: p.kind, sendAfter: p.sendAfter }));
  await enqueueDemoStaffMessages(registrationId, rows, supabase);
}

/** Staff reminders for a confirmed demo (used again when it is moved). */
export { enqueueStaffPlan };

/**
 * Confirm `r` (status pending or contacted). Returns whether a student message
 * was queued, so the caller can send it now instead of waiting for the cron.
 */
export async function confirmDemo(opts: {
  supabase: TypedSupabaseClient;
  actorId: string | null;
  r: DemoRequest;
  settings: DemoSettings;
  input: ConfirmInput;
  origin: string;
}): Promise<{ sendNow: boolean }> {
  const { supabase, actorId, r, settings, input, origin } = opts;
  if (!['pending', 'contacted'].includes(r.status)) throw new ConfirmError('Only a new or called request can be confirmed.');
  const { start, minutes, reason, meeting, conflictNote } = input;
  if (isOutsidePreference(start, { date: r.preferred_date, window: r.preferred_window }, settings.schedule) && !reason) {
    throw new ConfirmError('This time is outside what the student asked for. Add the reason (it goes in their message).');
  }
  if (!settings.hosts.length) throw new ConfirmError('Add the demo team in Demo settings first.');

  const known = new Map(settings.hosts.map((h) => [h.upn, h]));
  const team = (input.teamUpns.length ? input.teamUpns : settings.hosts.map((h) => h.upn)).filter((u) => known.has(u));
  if (!team.length) throw new ConfirmError('Pick at least one person from the demo team.');
  if (input.tutorUpn && !team.includes(input.tutorUpn)) throw new ConfirmError('The tutor must be one of the people on this demo.');
  if (input.organizerUpn && !team.includes(input.organizerUpn)) throw new ConfirmError('The organizer must be one of the people on this demo.');
  const roles = pickDemoRoles(settings, team, { tutor: input.tutorUpn, organizer: input.organizerUpn || r.organizer_upn });
  const tutorUpn = roles.tutor!;
  const organizerUpn = roles.organizer!;
  const tutor = known.get(tutorUpn)!;
  const ownLink = meeting === 'own_link' ? input.joinUrl : null;
  if (meeting === 'own_link' && !ownLink) throw new ConfirmError('Paste the full meeting link, starting with https://');

  // The tutor's calendar decides. A clash needs an internal note (never sent to the student).
  if (!isDemoTeamsDryRun()) {
    const busy = await getTeamBusy([tutorUpn], start, new Date(start.getTime() + minutes * 60_000));
    const clash = overlapping(busy[tutorUpn] ?? [], start, minutes);
    if (clash.length && !conflictNote) {
      throw new ConfirmError(`${tutor.name} is busy at that time in Outlook. Pick another time, or add a note saying why it is fine.`, 409);
    }
  }
  const parentEmail = input.parentEmail === undefined ? r.parent_email : input.parentEmail;

  let event: { joinUrl: string | null; eventId: string | null; optionsNote?: string | null } = { joinUrl: ownLink, eventId: null };
  if (meeting === 'teams') {
    const attendees: Array<{ email: string; name: string }> = [];
    if (r.email) attendees.push({ email: r.email, name: r.name });
    if (parentEmail && parentEmail !== r.email) attendees.push({ email: parentEmail, name: r.parent_name || 'Parent' });
    for (const upn of team) if (upn !== organizerUpn) attendees.push({ email: upn, name: known.get(upn)!.name });
    event = await createDemoEvent(
      {
        organizerUpn,
        subject: demoEventSubject(r),
        bodyHtml: buildDemoInviteHtml({
          studentName: r.name,
          hostName: tutor.name,
          ref: r.ref_code || '',
          myDemoUrl: `${origin}/d/${r.join_token}`,
          drawingLink: drawingWhatsAppLink(settings.drawingWhatsApp, r.ref_code),
        }),
        start,
        minutes,
        attendees,
      },
      r.ref_code || r.id,
    );
  }

  const staffIds = await staffUserIdsByUpn(team, supabase);
  await updateDemoRequest(
    r.id,
    {
      status: 'approved',
      scheduled_start: start.toISOString(),
      scheduled_minutes: minutes,
      schedule_change_reason: reason,
      organizer_upn: organizerUpn,
      tutor_upn: tutorUpn,
      staff_upns: team,
      host_user_id: staffIds[tutorUpn] ?? null,
      teams_join_url: event.joinUrl,
      graph_event_id: event.eventId,
      meeting_kind: meeting,
      parent_email: parentEmail,
      approved_by: actorId,
      approved_at: new Date().toISOString(),
      next_contact_at: null,
    },
    supabase,
  );
  await cancelPendingDemoMessages(r.id, undefined, supabase);
  if (meeting === 'teams') await enqueueDemoMessages(r, demoReminderPlan(start, new Date(), 'confirmed'), supabase);
  await enqueueStaffPlan(r.id, start, team, tutorUpn, staffIds, supabase);

  const names = team.map((u) => known.get(u)!.name).join(', ');
  const how =
    meeting === 'teams'
      ? `organizer ${known.get(organizerUpn)!.name}`
      : meeting === 'own_link'
        ? `own meeting link ${ownLink}`
        : meeting === 'later'
          ? 'meeting link to be added'
          : 'in person';
  await logDemoRequestEvent(
    {
      registration_id: r.id,
      kind: 'schedule',
      outcome: 'confirmed',
      note:
        `${formatDemoDateTime(start)}. Tutor ${tutor.name}, ${how}, team ${names}` +
        `${reason ? `. Reason: ${reason}` : ''}${conflictNote ? `. Calendar clash note: ${conflictNote}` : ''}` +
        `${meeting === 'teams' ? `. ${event.optionsNote ?? 'Recording starts automatically and guests skip the lobby'}` : ''}`,
      actor_id: actorId,
    },
    supabase,
  );
  return { sendNow: meeting === 'teams' };
}
