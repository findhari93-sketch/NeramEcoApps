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
  cancelPendingDemoMessages,
  demoReminderPlan,
  thanksSendAfter,
  formatDemoDateTime,
  openDemoFollowUp,
  getOpenDemoFollowUp,
  listDemoFollowUpsByDemo,
  rebookFollowUpAt,
  type InterestLevel,
  type DemoRequest,
} from '@neram/database';
import { getRequestAdminId } from '@/lib/request-admin';
import { loadDemoSettings, demoMarketingOrigin, sendDueDemoMessages, cancelledEventMarker } from '@/lib/demo/server';
import { ConfirmError, confirmDemo, enqueueStaffPlan, meetingUrl, parseMeetingKind } from '@/lib/demo/confirm';
import { studentGetsDemoWhatsApp } from '@/lib/demo/meeting';
import { HeldDemoError, parseHeldDemoWithSettings, recordHeldDemo } from '@/lib/demo/record-held';
import { rescheduleDemoEvent, cancelDemoEvent, DemoTeamsError } from '@/lib/demo/teams';

type Params = { params: { id: string } };

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
  const [followUp, latest] = await Promise.all([
    request.user_id ? getOpenDemoFollowUp(request.user_id, supabase) : Promise.resolve(null),
    listDemoFollowUpsByDemo([id], supabase),
  ]);
  // The newest follow-up of this demo even when it is closed (stopped or joined).
  const enrolmentLink = await deskEnrolmentLink(supabase, id, request.user_id);
  return { request, events, messages, actors, followUp, lastFollowUp: latest[id] ?? null, enrolmentLink };
}

/**
 * The student's enrolment link, made here or anywhere else (Direct Enroll,
 * Follow-ups), so the desk never offers a second one. Active first, then newest.
 */
async function deskEnrolmentLink(supabase: any, demoId: string, userId: string | null) {
  const match = userId ? `demo_registration_id.eq.${demoId},user_id.eq.${userId}` : `demo_registration_id.eq.${demoId}`;
  const { data, error } = await supabase
    .from('direct_enrollment_links')
    .select(
      'id, status, expires_at, created_at, created_by, final_fee, amount_paid, payment_scheme, installment_2_due_date, share_count, last_shared_at, payment_mode, total_fee, discount_amount, offer_full_amount, offer_installment_1, offer_installment_2, rejection_reason',
    )
    .or(match)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) {
    console.error('desk enrolment link lookup failed:', error.message);
    return null;
  }
  const now = Date.now();
  const rows = (data ?? []).map((l: any) => ({
    ...l,
    status: l.status === 'active' && l.expires_at && new Date(l.expires_at).getTime() < now ? 'expired' : l.status,
  }));
  // A payment waiting for staff comes first: it is the one thing to act on.
  const pick =
    rows.find((l: any) => l.status === 'payment_submitted') ||
    rows.find((l: any) => l.status === 'active') ||
    rows.find((l: any) => l.status === 'used') ||
    rows[0];
  if (!pick) return null;
  const { data: maker } = await supabase.from('users').select('name').eq('id', pick.created_by).maybeSingle();
  return { ...pick, created_by_name: maker?.name ?? null };
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
 * log_call | note | confirm | set_link | reschedule | cancel | attendance | held | follow_up | drawing | resend | reopen
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
        const settings = await loadDemoSettings(supabase);
        const requested = Array.isArray(body.teamUpns) ? (body.teamUpns as unknown[]).map((u) => text(u, 200).toLowerCase()) : [];
        const meeting = parseMeetingKind(body.meeting);
        const res = await confirmDemo({
          supabase,
          actorId,
          r,
          settings,
          origin,
          input: {
            start: parseStart(body.start),
            minutes: parseMinutes(body.minutes, settings.schedule.durationMinutes),
            reason: text(body.reason) || null,
            teamUpns: requested,
            tutorUpn: text(body.tutorUpn, 200).toLowerCase(),
            organizerUpn: text(body.organizerUpn, 200).toLowerCase(),
            meeting,
            joinUrl: meeting === 'own_link' ? meetingUrl(body.joinUrl) : null,
            conflictNote: text(body.conflictNote) || null,
            parentEmail: body.parentEmail === undefined ? undefined : email(body.parentEmail),
          },
        });
        sendNow = res.sendNow;
        break;
      }

      case 'set_link': {
        // A demo confirmed with "Link later" (or an own-link demo whose link changed).
        if (r.status !== 'approved') throw new ActionError('Add a link to a scheduled demo.');
        if (r.graph_event_id) throw new ActionError('This demo has a Teams meeting already.');
        const link = meetingUrl(body.joinUrl);
        if (!link) throw new ActionError('Paste the full meeting link, starting with https://');
        await updateDemoRequest(r.id, { teams_join_url: link, meeting_kind: 'own_link' }, supabase);
        await log('schedule', 'link_added', link);
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
        if (studentGetsDemoWhatsApp(r)) await enqueueDemoMessages(r, demoReminderPlan(start, new Date(), 'rescheduled'), supabase);
        await enqueueStaffPlan(r.id, start, r.staff_upns ?? [], r.tutor_upn, await staffUserIdsByUpn(r.staff_upns ?? [], supabase), supabase);
        await log('schedule', 'rescheduled', `${formatDemoDateTime(new Date(r.scheduled_start))} moved to ${formatDemoDateTime(start)}. Reason: ${reason}`);
        sendNow = studentGetsDemoWhatsApp(r);
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
        const interest = ['hot', 'warm', 'cold'].includes(String(body.interest)) ? (body.interest as InterestLevel) : null;
        const nextAt = typeof body.nextFollowUpAt === 'string' ? new Date(body.nextFollowUpAt) : null;
        if (attended && (!interest || !nextAt || Number.isNaN(nextAt.getTime()))) {
          throw new ActionError('Pick how interested they are and the first follow-up date.');
        }
        if (attended && nextAt!.getTime() <= Date.now()) throw new ActionError('Pick a follow-up date in the future.');
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
        if (r.user_id) {
          await openDemoFollowUp(
            attended
              ? { userId: r.user_id, demoRegistrationId: r.id, kind: 'post_demo', dueAt: nextAt!, interest, note: text(body.note, 1000) || null, actorId }
              : { userId: r.user_id, demoRegistrationId: r.id, kind: 'demo_rebook', dueAt: rebookFollowUpAt(new Date()), actorId },
            supabase,
          );
        }
        await log('status', attended ? 'attended' : 'no_show', attended ? `Interest ${interest}. ${text(body.note, 1000)}`.trim() : null);
        sendNow = !attended;
        break;
      }

      case 'held': {
        // The demo happened outside the desk (Google Meet, a call, in person), on an
        // open request or at another time than the one confirmed. A Teams event on a
        // confirmed demo is left alone: it is in the past or simply unused.
        if (!['pending', 'contacted', 'approved'].includes(r.status)) {
          throw new ActionError('This request is already done or closed.');
        }
        const { held, settings, tutorName } = await parseHeldDemoWithSettings(body, supabase);
        const res = await recordHeldDemo({
          supabase,
          actorId,
          userId: r.user_id,
          held,
          minutes: r.status === 'approved' && r.scheduled_minutes ? r.scheduled_minutes : settings.schedule.durationMinutes,
          tutorName,
          existing: r,
          source: r.status === 'approved' ? 'Recorded instead of the confirmed time.' : 'Recorded from the request.',
        });
        sendNow = res.queued;
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
        if (r.status === 'approved' && !studentGetsDemoWhatsApp(r)) {
          throw new ActionError('This demo is not on Teams, so there is no automatic message. Send the details to the student yourself on WhatsApp.');
        }
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

      case 'follow_up': {
        if (!['attended', 'no_show'].includes(r.status)) throw new ActionError('Start a follow-up after the demo has happened.');
        if (!r.user_id) throw new ActionError('This request has no person linked.');
        const at = typeof body.nextFollowUpAt === 'string' ? new Date(body.nextFollowUpAt) : null;
        if (!at || Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) throw new ActionError('Pick a follow-up date in the future.');
        const interest = ['hot', 'warm', 'cold'].includes(String(body.interest)) ? (body.interest as InterestLevel) : null;
        await openDemoFollowUp({ userId: r.user_id, demoRegistrationId: r.id, kind: 'post_demo', dueAt: at, interest, note: text(body.note, 1000) || null, actorId }, supabase);
        await log('status', 'follow_up_started', text(body.note, 1000) || null);
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
    if (error instanceof ActionError || error instanceof DemoTeamsError || error instanceof HeldDemoError || error instanceof ConfirmError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('demo-request action failed:', error);
    return NextResponse.json({ error: 'Something went wrong. Refresh and check the activity log before trying again.' }, { status: 500 });
  }
}
