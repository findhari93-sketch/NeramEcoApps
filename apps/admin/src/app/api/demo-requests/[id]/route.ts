export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getDemoRequestById,
  updateDemoRequest,
  logDemoRequestEvent,
  listDemoRequestEvents,
  listDemoRequestMessages,
  enqueueDemoMessages,
  enqueueDemoStaffMessages,
  staffUserIdsByUpn,
  staffReminderPlan,
  cancelPendingDemoMessages,
  demoReminderPlan,
  thanksSendAfter,
  isOutsidePreference,
  formatDemoDateTime,
  drawingWhatsAppLink,
  type DemoRequest,
} from '@neram/database';
import { getRequestAdminId } from '@/lib/request-admin';
import { loadDemoSettings, demoMarketingOrigin, sendDueDemoMessages, cancelledEventMarker } from '@/lib/demo/server';
import { buildDemoInviteHtml, demoEventSubject } from '@/lib/demo/messages';
import {
  createDemoEvent,
  rescheduleDemoEvent,
  cancelDemoEvent,
  getTeamBusy,
  overlapping,
  isDemoTeamsDryRun,
  DemoTeamsError,
} from '@/lib/demo/teams';

type Params = { params: { id: string } };

async function enqueueStaffPlan(
  registrationId: string,
  start: Date,
  team: string[],
  tutorUpn: string | null,
  ids: Record<string, string>,
): Promise<void> {
  const rows = staffReminderPlan(start, new Date(), team, tutorUpn)
    .filter((p) => ids[p.upn])
    .map((p) => ({ userId: ids[p.upn], kind: p.kind, sendAfter: p.sendAfter }));
  await enqueueDemoStaffMessages(registrationId, rows, getSupabaseAdminClient());
}

class ActionError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

async function detail(id: string) {
  const supabase = getSupabaseAdminClient();
  const request = await getDemoRequestById(id, supabase);
  if (!request) return null;
  const [events, messages] = await Promise.all([
    listDemoRequestEvents(id, supabase),
    listDemoRequestMessages(id, supabase),
  ]);
  // Names for the activity log's "by" column.
  const actorIds = Array.from(new Set(events.map((e) => e.actor_id).filter(Boolean))) as string[];
  let actors: Record<string, string> = {};
  if (actorIds.length) {
    const { data } = await (supabase as any).from('users').select('id, name').in('id', actorIds);
    actors = Object.fromEntries((data ?? []).map((u: { id: string; name: string }) => [u.id, u.name]));
  }
  return { request, events, messages, actors };
}

/** GET /api/demo-requests/[id]: the request, its activity log and its WhatsApp queue. */
export async function GET(_req: Request, { params }: Params) {
  try {
    const d = await detail(params.id);
    if (!d) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(d);
  } catch (error) {
    console.error('demo-request detail failed:', error);
    return NextResponse.json({ error: 'Could not load the request' }, { status: 500 });
  }
}

function parseStart(v: unknown): Date {
  const d = typeof v === 'string' ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) throw new ActionError('Pick a date and time.');
  if (d.getTime() < Date.now() - 5 * 60_000) throw new ActionError('That time has already passed.');
  return d;
}

function parseMinutes(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isInteger(n) && n >= 15 && n <= 180 ? n : fallback;
}

function text(v: unknown, max = 500): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function email(v: unknown): string | null {
  const s = text(v, 200).toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? s : null;
}

/**
 * POST /api/demo-requests/[id]  { action, ...fields }
 *
 * log_call | note | confirm | reschedule | cancel | attendance | drawing | resend | reopen
 * Every action writes the activity log and returns the refreshed detail.
 */
export async function POST(req: Request, { params }: Params) {
  const actorId = getRequestAdminId(req);
  const supabase = getSupabaseAdminClient();
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  try {
    const r = await getDemoRequestById(params.id, supabase);
    if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const log = (kind: 'call' | 'note' | 'status' | 'schedule' | 'drawing', outcome: string | null, note: string | null) =>
      logDemoRequestEvent({ registration_id: r.id, kind, outcome, note, actor_id: actorId }, supabase);
    const origin = demoMarketingOrigin(req.url);
    let sendNow = false;

    switch (body.action) {
      case 'log_call': {
        const outcome = body.outcome as DemoRequest['last_call_outcome'];
        const note = text(body.note) || null;
        if (!outcome || !['interested', 'no_answer', 'call_back', 'not_interested'].includes(outcome)) {
          throw new ActionError('Pick how the call went.');
        }
        if (!['pending', 'contacted'].includes(r.status)) throw new ActionError('This request is already confirmed or closed.');
        const patch: Partial<DemoRequest> = { last_call_outcome: outcome };
        if (outcome === 'interested') {
          patch.status = 'contacted';
          patch.next_contact_at = null;
        } else if (outcome === 'call_back') {
          const at = typeof body.nextContactAt === 'string' ? new Date(body.nextContactAt) : null;
          if (!at || Number.isNaN(at.getTime())) throw new ActionError('Pick when to call back.');
          patch.status = 'contacted';
          patch.next_contact_at = at.toISOString();
        } else if (outcome === 'not_interested') {
          if (!note) throw new ActionError('Add a short reason so the team knows why.');
          patch.status = 'rejected';
          patch.rejection_reason = note;
          patch.next_contact_at = null;
        }
        await updateDemoRequest(r.id, patch, supabase);
        if (outcome === 'not_interested') await cancelPendingDemoMessages(r.id, undefined, supabase);
        // Neram Assistant reminds whoever logged the call when the call-back is due.
        if (outcome === 'call_back' && actorId && patch.next_contact_at) {
          await cancelPendingDemoMessages(r.id, ['staff_callback'], supabase);
          await enqueueDemoStaffMessages(
            r.id,
            [{ userId: actorId, kind: 'staff_callback', sendAfter: new Date(patch.next_contact_at) }],
            supabase,
          );
        }
        await log('call', outcome, note);
        break;
      }

      case 'note': {
        const note = text(body.note, 2000);
        if (!note) throw new ActionError('Write a note first.');
        await log('note', null, note);
        break;
      }

      case 'confirm': {
        if (!['pending', 'contacted'].includes(r.status)) throw new ActionError('Only a new or called request can be confirmed.');
        const settings = await loadDemoSettings(supabase);
        const start = parseStart(body.start);
        const minutes = parseMinutes(body.minutes, settings.schedule.durationMinutes);
        const reason = text(body.reason) || null;
        if (isOutsidePreference(start, { date: r.preferred_date, window: r.preferred_window }, settings.schedule) && !reason) {
          throw new ActionError('This time is outside what the student asked for. Add the reason (it goes in their message).');
        }
        if (!settings.hosts.length) throw new ActionError('Add the demo team in Demo settings first.');

        // The team for this demo: any of the configured members, at least one.
        const known = new Map(settings.hosts.map((h) => [h.upn, h]));
        const requested = Array.isArray(body.teamUpns) ? (body.teamUpns as unknown[]).map((u) => text(u, 200).toLowerCase()) : [];
        const team = (requested.length ? requested : settings.hosts.map((h) => h.upn)).filter((u) => known.has(u));
        if (!team.length) throw new ActionError('Pick at least one person from the demo team.');
        const fallbackTutor = settings.defaultTutorUpn && team.includes(settings.defaultTutorUpn) ? settings.defaultTutorUpn : team[0];
        const tutorUpn = text(body.tutorUpn, 200).toLowerCase() || fallbackTutor;
        const organizerUpn = text(body.organizerUpn, 200).toLowerCase() || tutorUpn;
        if (!team.includes(tutorUpn)) throw new ActionError('The tutor must be one of the people on this demo.');
        if (!team.includes(organizerUpn)) throw new ActionError('The organizer must be one of the people on this demo.');
        const tutor = known.get(tutorUpn)!;

        // The tutor's calendar decides. A clash needs an internal note (never sent to the student).
        const conflictNote = text(body.conflictNote) || null;
        if (!isDemoTeamsDryRun()) {
          const busy = await getTeamBusy([tutorUpn], start, new Date(start.getTime() + minutes * 60_000));
          const clash = overlapping(busy[tutorUpn] ?? [], start, minutes);
          if (clash.length && !conflictNote) {
            throw new ActionError(
              `${tutor.name} is busy at that time in Outlook. Pick another time, or add a note saying why it is fine.`,
              409,
            );
          }
        }
        const parentEmail = body.parentEmail === undefined ? r.parent_email : email(body.parentEmail);

        const attendees: Array<{ email: string; name: string }> = [];
        if (r.email) attendees.push({ email: r.email, name: r.name });
        if (parentEmail && parentEmail !== r.email) attendees.push({ email: parentEmail, name: r.parent_name || 'Parent' });
        for (const upn of team) if (upn !== organizerUpn) attendees.push({ email: upn, name: known.get(upn)!.name });

        const myDemoUrl = `${origin}/d/${r.join_token}`;
        const event = await createDemoEvent(
          {
            organizerUpn,
            subject: demoEventSubject(r),
            bodyHtml: buildDemoInviteHtml({
              studentName: r.name,
              hostName: tutor.name,
              ref: r.ref_code || '',
              myDemoUrl,
              drawingLink: drawingWhatsAppLink(settings.drawingWhatsApp, r.ref_code),
            }),
            start,
            minutes,
            attendees,
          },
          r.ref_code || r.id,
        );

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
            parent_email: parentEmail,
            approved_by: actorId,
            approved_at: new Date().toISOString(),
            next_contact_at: null,
          },
          supabase,
        );
        await cancelPendingDemoMessages(r.id, undefined, supabase);
        await enqueueDemoMessages(r, demoReminderPlan(start, new Date(), 'confirmed'), supabase);
        await enqueueStaffPlan(r.id, start, team, tutorUpn, staffIds);
        const names = team.map((u) => known.get(u)!.name).join(', ');
        await log(
          'schedule',
          'confirmed',
          `${formatDemoDateTime(start)}. Tutor ${tutor.name}, organizer ${known.get(organizerUpn)!.name}, team ${names}` +
            `${reason ? `. Reason: ${reason}` : ''}${conflictNote ? `. Calendar clash note: ${conflictNote}` : ''}`,
        );
        sendNow = true;
        break;
      }

      case 'reschedule': {
        if (r.status !== 'approved' || !r.scheduled_start) throw new ActionError('Only a confirmed demo can be moved.');
        const start = parseStart(body.start);
        const minutes = parseMinutes(body.minutes, r.scheduled_minutes);
        const reason = text(body.reason);
        if (!reason) throw new ActionError('Add the reason for the change (it goes in their message).');
        if (r.organizer_upn && r.graph_event_id) await rescheduleDemoEvent(r.organizer_upn, r.graph_event_id, start, minutes);
        await updateDemoRequest(
          r.id,
          { scheduled_start: start.toISOString(), scheduled_minutes: minutes, schedule_change_reason: reason },
          supabase,
        );
        await cancelPendingDemoMessages(r.id, undefined, supabase);
        await enqueueDemoMessages(r, demoReminderPlan(start, new Date(), 'rescheduled'), supabase);
        await enqueueStaffPlan(r.id, start, r.staff_upns ?? [], r.tutor_upn, await staffUserIdsByUpn(r.staff_upns ?? [], supabase));
        await log('schedule', 'rescheduled', `${formatDemoDateTime(new Date(r.scheduled_start))} moved to ${formatDemoDateTime(start)}. Reason: ${reason}`);
        sendNow = true;
        break;
      }

      case 'cancel': {
        if (!['pending', 'contacted', 'approved'].includes(r.status)) throw new ActionError('This request is already closed.');
        const reason = text(body.reason);
        if (!reason) throw new ActionError('Add the reason for cancelling.');
        const wasConfirmed = r.status === 'approved';
        if (wasConfirmed && r.organizer_upn && r.graph_event_id) {
          await cancelDemoEvent(r.organizer_upn, r.graph_event_id, reason);
        }
        await updateDemoRequest(
          r.id,
          {
            status: 'cancelled',
            cancel_reason: reason,
            next_contact_at: null,
            ...(r.graph_event_id ? { graph_event_id: cancelledEventMarker(r.graph_event_id) } : {}),
          },
          supabase,
        );
        await cancelPendingDemoMessages(r.id, undefined, supabase);
        if (wasConfirmed) {
          await enqueueDemoMessages(r, [{ kind: 'cancelled', sendAfter: new Date() }], supabase);
          sendNow = true;
        }
        await log('status', 'cancelled', reason);
        break;
      }

      case 'attendance': {
        if (!['approved', 'attended', 'no_show'].includes(r.status) || !r.scheduled_start) {
          throw new ActionError('Attendance is marked on a confirmed demo.');
        }
        const attended = body.attended === true;
        await updateDemoRequest(
          r.id,
          {
            status: attended ? 'attended' : 'no_show',
            attended,
            attendance_marked_at: new Date().toISOString(),
          },
          supabase,
        );
        await (supabase as any).from('demo_class_registrations').update({ attendance_marked_by: actorId }).eq('id', r.id);
        await cancelPendingDemoMessages(r.id, undefined, supabase);
        const now = new Date();
        await enqueueDemoMessages(
          r,
          [
            attended
              ? { kind: 'thanks', sendAfter: thanksSendAfter(new Date(r.scheduled_start), r.scheduled_minutes, now) }
              : { kind: 'missed', sendAfter: now },
          ],
          supabase,
        );
        await log('status', attended ? 'attended' : 'no_show', null);
        sendNow = !attended;
        break;
      }

      case 'drawing': {
        const field = body.field === 'feedback' ? 'drawing_feedback_at' : body.field === 'received' ? 'drawing_received_at' : null;
        if (!field) throw new ActionError('Bad request');
        const on = body.value === true;
        await updateDemoRequest(r.id, { [field]: on ? new Date().toISOString() : null }, supabase);
        await log('drawing', `${body.field}${on ? '' : '_undone'}`, null);
        break;
      }

      case 'resend': {
        if (r.status === 'approved') {
          await enqueueDemoMessages(r, [{ kind: 'confirmed', sendAfter: new Date() }], supabase);
        } else if (r.status === 'pending' || r.status === 'contacted') {
          await enqueueDemoMessages(r, [{ kind: 'received', sendAfter: new Date() }], supabase);
        } else {
          throw new ActionError('Nothing to resend for a closed request.');
        }
        await log('note', 'resend', 'Resent the WhatsApp message');
        sendNow = true;
        break;
      }

      case 'reopen': {
        if (!['rejected', 'cancelled', 'no_show'].includes(r.status)) throw new ActionError('Only a closed request can be reopened.');
        await updateDemoRequest(
          r.id,
          {
            status: 'contacted',
            scheduled_start: null,
            teams_join_url: null,
            graph_event_id: null,
            cancel_reason: null,
            rejection_reason: null,
          },
          supabase,
        );
        await log('status', 'reopened', text(body.note) || null);
        break;
      }

      default:
        throw new ActionError('Unknown action');
    }

    let send: { sent: number; failed: number; skipped: number } | null = null;
    if (sendNow) {
      // The confirmation should not wait for the next 5-minute cron tick.
      send = await sendDueDemoMessages({ origin, registrationId: r.id }).catch((err) => {
        console.error('demo immediate send failed:', err);
        return null;
      });
    }

    return NextResponse.json({ ...(await detail(r.id)), send });
  } catch (error) {
    if (error instanceof ActionError || error instanceof DemoTeamsError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('demo-request action failed:', error);
    return NextResponse.json({ error: 'Something went wrong. Refresh and check the activity log before trying again.' }, { status: 500 });
  }
}
