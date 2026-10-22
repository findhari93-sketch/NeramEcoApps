export const dynamic = 'force-dynamic';

import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getDemoRequestById,
  getDirectEnrollmentLinkById,
  createDirectEnrollmentLink,
  updateDemoRequest,
  logDemoRequestEvent,
  listDemoRequestEvents,
  listDemoRequestMessages,
  enqueueDemoMessages,
  enqueueDemoStaffMessages,
  staffUserIdsByUpn,
  getStudentProfileByUserId,
  loadStudentFeeState,
  cancelPendingDemoMessages,
  demoReminderPlan,
  thanksSendAfter,
  formatDemoDateTime,
  openDemoFollowUp,
  getOpenDemoFollowUp,
  listDemoFollowUpsByDemo,
  rebookFollowUpAt,
  pickDemoRoles,
  type InterestLevel,
  type DemoRequest,
  type FeeView,
} from '@neram/database';
import { getRequestAdminId } from '@/lib/request-admin';
import { loadDemoSettings, demoMarketingOrigin, sendDueDemoMessages, cancelledEventMarker } from '@/lib/demo/server';
import { ConfirmError, confirmDemo, applyDemoTeamsMeeting, enqueueStaffPlan, meetingUrl, parseMeetingKind } from '@/lib/demo/confirm';
import { studentGetsDemoWhatsApp } from '@/lib/demo/meeting';
import { HeldDemoError, parseHeldDemoWithSettings, recordHeldDemo } from '@/lib/demo/record-held';
import { DEFAULT_HELD_TUTOR, STAFF_DEMO_PLATFORMS, heldTutorOptions } from '@/lib/demo/staff-add';
import { rescheduleDemoEvent, cancelDemoEvent, getTeamBusy, overlapping, isDemoTeamsDryRun, DemoTeamsError } from '@/lib/demo/teams';
import { hasLiveTeamsMeeting, syncDemoTeams } from '@/lib/demo/teams-sync';
import type { DemoWithTeams } from '@/lib/demo/teams-artifacts';
import { finaliseEnrolmentFromDesk } from '@neram/database/desk-finalise-enrolment';
import { linkIsUnfinalisedRecorded } from '@/components/demo-requests/journey';

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
  // Names for the activity log's "by" column, plus the audit line (added / last edited by).
  const actorIds = Array.from(
    new Set([...events.map((e) => e.actor_id), request.created_by, request.last_edited_by].filter(Boolean)),
  ) as string[];
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
  // The live fee ledger (agreed, paid, balance, schedule, next due) for an enrolled
  // or part-paid student. Only when the demo is tied to a user; a fee-load failure
  // must never break the panel, so it is caught and the fee is simply omitted.
  let fee: FeeView | null = null;
  if (request.user_id) {
    try {
      fee = (await loadStudentFeeState(supabase, request.user_id)).view;
    } catch (err) {
      console.error('demo detail fee load failed:', err);
    }
  }
  return {
    request,
    events,
    messages,
    actors,
    followUp,
    lastFollowUp: latest[id] ?? null,
    enrolmentLink,
    fee,
    createdByName: request.created_by ? actors[request.created_by] ?? null : null,
    lastEditedByName: request.last_edited_by ? actors[request.last_edited_by] ?? null : null,
  };
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
      'id, status, expires_at, created_at, created_by, final_fee, amount_paid, payment_scheme, installment_2_due_date, share_count, last_shared_at, payment_mode, total_fee, discount_amount, offer_full_amount, offer_installment_1, offer_installment_2, rejection_reason, verified_at, verified_by, user_id, submitted_user_id',
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
 * | teams_check | pick_recording | edit_details | create_teams_meeting | edit_held | finalise_enrolment | record_enrolment
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

      case 'finalise_enrolment': {
        // Staff entered a payment on the enrolment link but never finalised it.
        // Record it and enrol them from the desk, no second form for the student.
        if (!actorId) throw new ActionError('Sign in again to continue.', 401);
        const linkId = text(body.linkId, 64);
        if (!linkId) throw new ActionError('Bad request');
        const link = await getDirectEnrollmentLinkById(linkId, supabase);
        if (!link) throw new ActionError('That enrolment link was not found.', 404);
        const belongs = link.demo_registration_id === r.id || (!!r.user_id && link.user_id === r.user_id);
        if (!belongs) throw new ActionError('That link is for a different student.');
        if (!linkIsUnfinalisedRecorded(link)) {
          throw new ActionError(link.status === 'used' ? 'This enrolment is already finalised.' : 'There is no recorded payment to finalise on this link.');
        }
        const totalFee = Number(body.totalFee);
        const amountPaid = Number(body.amountPaid);
        if (!Number.isFinite(totalFee) || totalFee <= 0) throw new ActionError('Enter the total fee.');
        if (!Number.isFinite(amountPaid) || amountPaid <= 0) throw new ActionError('Enter the amount paid.');
        if (amountPaid > totalFee + 0.01) throw new ActionError('The amount paid cannot be more than the total fee.');
        const mode = body.mode === 'fold_parent' ? 'fold_parent' : 'create';
        const studentUserId = text(body.studentUserId, 64);
        if (mode === 'fold_parent' && !studentUserId) throw new ActionError('Pick the existing student account to link.');
        const dueDate = typeof body.installment2DueDate === 'string' && body.installment2DueDate ? body.installment2DueDate : null;
        const res = await finaliseEnrolmentFromDesk(supabase, {
          link,
          demoId: r.id,
          actorId,
          money: { totalFee, amountPaid, installment2DueDate: dueDate, method: 'manual' },
          target: mode === 'fold_parent' ? { mode, studentUserId } : { mode: 'create' },
        });
        if (!res.ok) throw new ActionError(res.error, res.status);
        await log(
          'status',
          'enrolled',
          `Finalised the enrolment from the desk: ₹${Math.round(amountPaid).toLocaleString('en-IN')} of ₹${Math.round(totalFee).toLocaleString('en-IN')} recorded${
            res.mode === 'fold_parent' ? ', folded the parent account into the student' : ''
          }.${res.applicationNumber ? ` (${res.applicationNumber})` : ''}`,
        );
        break;
      }

      case 'record_enrolment': {
        // Enrol a demo student from the desk when there is no enrolment link yet
        // (a historical demo, or one recorded as held outside the desk). Make a
        // recorded link tied to this demo, then run the same finalise engine, so
        // the records match the normal enrolment path and the student moves to
        // the Enrolled tab.
        if (!actorId) throw new ActionError('Sign in again to continue.', 401);
        if (!['attended', 'no_show'].includes(r.status)) throw new ActionError('Record the enrolment after the demo is marked as held.');
        if (!r.user_id) {
          throw new ActionError('This demo has no account linked yet. Open it in People to create or link an account, then record the enrolment.');
        }
        const userId = r.user_id;
        const totalFee = Number(body.totalFee);
        const amountPaid = Number(body.amountPaid);
        if (!Number.isFinite(totalFee) || totalFee <= 0) throw new ActionError('Enter the total fee.');
        if (!Number.isFinite(amountPaid) || amountPaid <= 0) throw new ActionError('Enter the amount paid.');
        if (amountPaid > totalFee + 0.01) throw new ActionError('The amount paid cannot be more than the total fee.');
        const balance = Math.max(0, Math.round((totalFee - amountPaid) * 100) / 100);
        const scheme: 'full' | 'installment' = balance > 0.01 ? 'installment' : 'full';
        const dueDate = typeof body.installment2DueDate === 'string' && body.installment2DueDate ? body.installment2DueDate : null;
        const method = text(body.method, 40) || 'manual';
        const reference = text(body.reference, 120) || null;
        const paidOn = typeof body.paymentDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.paymentDate) ? body.paymentDate : null;
        let mode: 'create' | 'fold_parent' = body.mode === 'fold_parent' ? 'fold_parent' : 'create';
        let studentUserId = text(body.studentUserId, 64);
        if (mode === 'fold_parent' && !studentUserId) throw new ActionError('Pick the existing student account to link.');
        // An account that is already a student keeps its profile: update it in place,
        // never a second profile or a renamed student. The engine's fold path does
        // exactly this when the student and the demo account are the same id.
        if (mode === 'create' && (await getStudentProfileByUserId(userId, supabase))) {
          mode = 'fold_parent';
          studentUserId = userId;
        }

        // Reuse the student's active link if one is already open; never make a second.
        const existing = await deskEnrolmentLink(supabase, r.id, userId);
        if (existing && existing.status === 'used') throw new ActionError('This student is already enrolled.');
        let link =
          existing && (existing.status === 'active' || existing.status === 'payment_submitted')
            ? await getDirectEnrollmentLinkById(existing.id, supabase)
            : null;
        if (!link) {
          const COURSES = new Set(['nata', 'jee_paper2', 'both', 'revit', 'not_sure']);
          link = await createDirectEnrollmentLink(
            {
              token: randomBytes(16).toString('base64url'),
              created_by: actorId,
              student_name: r.name || 'Student',
              student_phone: r.phone || undefined,
              student_email: r.email || undefined,
              interest_course: (COURSES.has(String(r.interest_course)) ? r.interest_course : 'not_sure') as any,
              total_fee: totalFee,
              final_fee: totalFee,
              amount_paid: amountPaid,
              payment_method: method,
              transaction_reference: reference || undefined,
              payment_date: paidOn || undefined,
              user_id: userId,
              demo_registration_id: r.id,
              payment_scheme: scheme,
              installment_2_amount: scheme === 'installment' ? balance : null,
              installment_2_due_date: scheme === 'installment' ? dueDate : null,
              payment_mode: 'recorded',
            },
            supabase,
          );
        }

        const res = await finaliseEnrolmentFromDesk(supabase, {
          link,
          demoId: r.id,
          actorId,
          money: { totalFee, amountPaid, installment2DueDate: dueDate, method, reference, paidOn },
          target: mode === 'fold_parent' ? { mode, studentUserId } : { mode: 'create' },
        });
        if (!res.ok) throw new ActionError(res.error, res.status);
        await log(
          'status',
          'enrolled',
          `Recorded the enrolment from the desk: ₹${Math.round(amountPaid).toLocaleString('en-IN')} of ₹${Math.round(totalFee).toLocaleString('en-IN')} recorded${
            res.mode === 'fold_parent' ? ', folded the parent account into the student' : ''
          }.${res.applicationNumber ? ` (${res.applicationNumber})` : ''}`,
        );
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
        // Optionally reassign who takes it / the team. Changing the tutor is only
        // safe without a Teams event: the calendar's attendees/presenters are not
        // re-patched here, so a Teams demo must be recreated to change who takes it.
        let tutorUpn = r.tutor_upn;
        let team = r.staff_upns ?? [];
        const wantsTeam = Array.isArray(body.teamUpns);
        const wantsTutor = typeof body.tutorUpn === 'string' && body.tutorUpn.trim().length > 0;
        if (wantsTeam || wantsTutor) {
          if (r.graph_event_id) throw new ActionError('To change who takes a Teams demo, cancel it and create a new meeting.');
          const settings = await loadDemoSettings(supabase);
          const known = new Map(settings.hosts.map((h) => [h.upn, h] as const));
          const requested = wantsTeam ? (body.teamUpns as unknown[]).map((u) => text(u, 200).toLowerCase()) : team;
          const nextTeam = (requested.length ? requested : team).filter((u) => known.has(u));
          if (!nextTeam.length) throw new ActionError('Pick at least one person from the demo team.');
          const tutorIn = wantsTutor ? text(body.tutorUpn, 200).toLowerCase() : tutorUpn ?? '';
          const roles = pickDemoRoles(settings, nextTeam, { tutor: tutorIn || tutorUpn, organizer: r.organizer_upn });
          team = nextTeam;
          tutorUpn = roles.tutor!;
        }
        if (r.organizer_upn && r.graph_event_id) await rescheduleDemoEvent(r.organizer_upn, r.graph_event_id, start, minutes);
        await updateDemoRequest(
          r.id,
          { scheduled_start: start.toISOString(), scheduled_minutes: minutes, schedule_change_reason: reason, tutor_upn: tutorUpn, staff_upns: team },
          supabase,
        );
        await cancelPendingDemoMessages(r.id, undefined, supabase);
        if (studentGetsDemoWhatsApp(r)) await enqueueDemoMessages(r, demoReminderPlan(start, new Date(), 'rescheduled'), supabase);
        await enqueueStaffPlan(r.id, start, tutorUpn, await staffUserIdsByUpn(team, supabase), supabase);
        await log('schedule', 'rescheduled', `${formatDemoDateTime(new Date(r.scheduled_start))} moved to ${formatDemoDateTime(start)}. Reason: ${reason}`);
        sendNow = studentGetsDemoWhatsApp(r);
        break;
      }

      case 'edit_details': {
        // Fix the person's data on the desk (a wrongly-typed name, a corrected
        // phone/email/class/parent). Edits the demo row; People stays the full
        // CRM editor for the linked account.
        const patch: Partial<DemoRequest> = {};
        if (typeof body.name === 'string') {
          const name = text(body.name, 120);
          if (!name) throw new ActionError('Name cannot be empty.');
          patch.name = name;
        }
        if (typeof body.phone === 'string') {
          const p = text(body.phone, 20);
          if (!p) throw new ActionError('Phone cannot be empty.');
          patch.phone = p;
        }
        if (body.email !== undefined) patch.email = email(body.email);
        if (body.currentClass !== undefined) patch.current_class = text(body.currentClass, 20) || null;
        if (body.examYear !== undefined) {
          const y = Number(body.examYear);
          patch.exam_year = Number.isInteger(y) && y >= 2024 && y <= 2035 ? y : null;
        }
        if (body.parentName !== undefined) patch.parent_name = text(body.parentName, 120) || null;
        if (body.parentPhone !== undefined) patch.parent_phone = text(body.parentPhone, 20) || null;
        if (body.parentEmail !== undefined) patch.parent_email = email(body.parentEmail);
        if (typeof body.parentJoining === 'boolean') patch.parent_joining = body.parentJoining;
        if (body.accountHolder === 'student' || body.accountHolder === 'parent') patch.account_holder = body.accountHolder;
        if (Object.keys(patch).length === 0) throw new ActionError('Nothing to change.');
        await updateDemoRequest(r.id, patch, supabase);
        const LABELS: Record<string, string> = {
          name: 'name', phone: 'phone', email: 'email', current_class: 'class', exam_year: 'exam year',
          parent_name: 'parent name', parent_phone: 'parent phone', parent_email: 'parent email',
          parent_joining: 'parent joining', account_holder: 'account holder',
        };
        await log('note', 'edited', `Edited details: ${Object.keys(patch).map((k) => LABELS[k] ?? k).join(', ')}.`);
        break;
      }

      case 'create_teams_meeting': {
        // Turn a scheduled demo with no link (later / own link / in person) into
        // an auto-recorded Teams meeting that invites the team and the student.
        if (r.status !== 'approved' || !r.scheduled_start) throw new ActionError('Add a Teams meeting to a scheduled demo.');
        if (r.graph_event_id) throw new ActionError('This demo already has a Teams meeting.');
        const settings = await loadDemoSettings(supabase);
        if (!settings.hosts.length) throw new ActionError('Add the demo team in Demo settings first.');
        const known = new Map(settings.hosts.map((h) => [h.upn, h] as const));
        const requested = Array.isArray(body.teamUpns) ? (body.teamUpns as unknown[]).map((u) => text(u, 200).toLowerCase()) : [];
        const team = (requested.length ? requested : r.staff_upns?.length ? r.staff_upns : settings.hosts.map((h) => h.upn)).filter((u) => known.has(u));
        if (!team.length) throw new ActionError('Pick at least one person from the demo team.');
        const tutorIn = text(body.tutorUpn, 200).toLowerCase();
        const orgIn = text(body.organizerUpn, 200).toLowerCase();
        if (tutorIn && !team.includes(tutorIn)) throw new ActionError('The tutor must be one of the people on this demo.');
        if (orgIn && !team.includes(orgIn)) throw new ActionError('The organizer must be one of the people on this demo.');
        const roles = pickDemoRoles(settings, team, { tutor: tutorIn || r.tutor_upn, organizer: orgIn || r.organizer_upn });
        const tutorUpn = roles.tutor!;
        const organizerUpn = roles.organizer!;
        const start = new Date(r.scheduled_start);
        const minutes = r.scheduled_minutes;
        const conflictNote = text(body.conflictNote) || null;
        if (!isDemoTeamsDryRun()) {
          const busy = await getTeamBusy([tutorUpn], start, new Date(start.getTime() + minutes * 60_000));
          const clash = overlapping(busy[tutorUpn] ?? [], start, minutes);
          if (clash.length && !conflictNote) {
            throw new ActionError(`${known.get(tutorUpn)?.name ?? 'The tutor'} is busy then in Outlook. Move the demo, or add a note saying why it is fine.`, 409);
          }
        }
        const parentEmail = body.parentEmail === undefined ? r.parent_email : email(body.parentEmail);
        const event = await applyDemoTeamsMeeting({
          supabase, actorId, r, settings, origin, start, minutes, team, tutorUpn, organizerUpn, parentEmail, reason: r.schedule_change_reason,
        });
        const names = team.map((u) => known.get(u)!.name).join(', ');
        await log(
          'schedule',
          'teams_created',
          `Teams meeting created. Tutor ${known.get(tutorUpn)!.name}, organizer ${known.get(organizerUpn)!.name}, team ${names}. ` +
            `${event.optionsNote ?? 'Recording starts automatically and guests skip the lobby'}${conflictNote ? `. Calendar clash note: ${conflictNote}` : ''}`,
        );
        sendNow = true;
        break;
      }

      case 'edit_held': {
        // Correct a demo recorded as held outside the desk: its time, who took it,
        // and the platform note. Outcome (attended/no-show) stays on Attended/No-show.
        if (!['attended', 'no_show'].includes(r.status)) throw new ActionError('This is only for a demo already recorded as held.');
        if (r.organizer_upn) throw new ActionError('This demo has a Teams meeting. Use Move to change its time.');
        const at = new Date(text(body.heldAt, 40));
        if (Number.isNaN(at.getTime())) throw new ActionError('Pick when the demo happened.');
        if (at.getTime() > Date.now() + 5 * 60_000) throw new ActionError('That time is in the future.');
        const settings = await loadDemoSettings(supabase);
        const tutors = heldTutorOptions(settings.hosts);
        const tutorUpn = text(body.tutorUpn, 200).toLowerCase() || r.tutor_upn || DEFAULT_HELD_TUTOR.upn;
        if (!tutors.some((t) => t.upn === tutorUpn)) throw new ActionError('Pick who took the demo from the demo team.');
        const platform = STAFF_DEMO_PLATFORMS.find((p) => p.id === text(body.platform, 20));
        const staffIds = await staffUserIdsByUpn([tutorUpn], supabase);
        await updateDemoRequest(
          r.id,
          { scheduled_start: at.toISOString(), tutor_upn: tutorUpn, host_user_id: staffIds[tutorUpn] ?? null },
          supabase,
        );
        const tutorName = tutors.find((t) => t.upn === tutorUpn)?.name ?? tutorUpn;
        const extra = text(body.note, 500);
        await log(
          'schedule',
          'held_edited',
          `Corrected the held demo: ${formatDemoDateTime(at)}${platform ? ` on ${platform.label}` : ''}, taken by ${tutorName}.${extra ? ` ${extra}` : ''}`,
        );
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
        // A staff mark is final: the Teams check never changes it (lib/demo/demo-verdict verdictAction).
        await (supabase as any).from('demo_class_registrations').update({ attendance_marked_by: actorId, attendance_source: 'staff' }).eq('id', r.id);
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
        const corrected = (r as DemoWithTeams).attendance_source === 'teams' ? ' Corrected the automatic mark.' : '';
        await log(
          'status',
          attended ? 'attended' : 'no_show',
          `${attended ? `Interest ${interest}. ${text(body.note, 1000)}`.trim() : ''}${corrected}`.trim() || null,
        );
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

      case 'teams_check': {
        // On demand, any time: also covers a test run held before the booked time.
        if (!hasLiveTeamsMeeting(r)) throw new ActionError('This demo has no Teams meeting made by the desk.');
        await syncDemoTeams(r as DemoWithTeams, supabase);
        break;
      }

      case 'pick_recording': {
        const itemId = text(body.itemId, 300);
        const pick = ((r as DemoWithTeams).recording_candidates ?? []).find((f) => f.itemId === itemId);
        if (!pick) throw new ActionError('That recording is not in the list any more. Check Teams again.');
        await (supabase as any)
          .from('demo_class_registrations')
          .update({
            recording_drive_id: pick.driveId,
            recording_item_id: pick.itemId,
            recording_name: pick.name,
            recording_web_url: pick.webUrl,
            recording_picked_by: actorId,
            recording_picked_at: new Date().toISOString(),
          })
          .eq('id', r.id);
        await log('note', 'recording_picked', pick.name);
        break;
      }

      default:
        throw new ActionError('Unknown action');
    }

    // Audit: stamp who last edited the demo on the structural changes (not on a
    // plain note, call log, drawing toggle or Teams re-check).
    const STRUCTURAL_EDITS = new Set([
      'confirm', 'set_link', 'reschedule', 'cancel', 'attendance', 'held', 'reopen',
      'create_teams_meeting', 'edit_details', 'edit_held', 'record_enrolment',
    ]);
    if (actorId && STRUCTURAL_EDITS.has(String(body.action))) {
      await (supabase as any)
        .from('demo_class_registrations')
        .update({ last_edited_by: actorId, last_edited_at: new Date().toISOString() })
        .eq('id', r.id);
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
