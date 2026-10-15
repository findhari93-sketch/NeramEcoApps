export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  istDateKey,
  listDemoRequests,
  getUserByPhone,
  createUser,
  createDemoRequestWithRef,
  DemoActiveRequestError,
  getActiveDemoRequestForUser,
  updateDemoRequest,
  logDemoRequestEvent,
  enqueueDemoMessages,
  cancelPendingDemoMessages,
  thanksSendAfter,
  demoPhone10,
  formatDemoDateTime,
  openDemoFollowUp,
  listDemoFollowUpsByDemo,
  rebookFollowUpAt,
  type InterestLevel,
  type DemoRequest,
  type DemoWindow,
  type UserType,
  type UserStatus,
} from '@neram/database';
import { getRequestAdminId } from '@/lib/request-admin';
import { loadDemoSettings, demoMarketingOrigin, sendDueDemoMessages } from '@/lib/demo/server';
import { STAFF_DEMO_CHANNELS, STAFF_DEMO_PLATFORMS, STAFF_DEMO_PAGE_CODE } from '@/lib/demo/staff-add';

/**
 * GET /api/demo-requests
 *
 * The request desk in one call: every v2 demo request from the last 120 days,
 * the KPI row, and the settings the Confirm form needs (hosts, windows).
 * Staff only (middleware). Tabs are filtered in the browser; volume is tens a week.
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();
    const since = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
    const [requests, settings] = await Promise.all([listDemoRequests({ since }, supabase), loadDemoSettings(supabase)]);

    const now = Date.now();
    const today = istDateKey(new Date());
    const in7 = now + 7 * 24 * 60 * 60 * 1000;
    const ago30 = now - 30 * 24 * 60 * 60 * 1000;

    const startOf = (s: string | null) => (s ? new Date(s).getTime() : null);
    let attended = 0;
    let noShow = 0;
    for (const r of requests) {
      const t = startOf(r.scheduled_start);
      if (t && t >= ago30 && t <= now) {
        if (r.status === 'attended') attended++;
        if (r.status === 'no_show') noShow++;
      }
    }

    // Enrolled after a demo: requests in the last 30 days whose person now has a student profile.
    const recentUserIds = Array.from(
      new Set(requests.filter((r) => r.user_id && new Date(r.created_at).getTime() >= ago30).map((r) => r.user_id as string)),
    );
    const doneIds = requests.filter((r) => r.status === 'attended' || r.status === 'no_show').map((r) => r.id);
    const followUps = await listDemoFollowUpsByDemo(doneIds, supabase);
    const userIds = Array.from(new Set(requests.filter((r) => r.user_id).map((r) => r.user_id as string)));
    const joinedAt: Record<string, string> = {};
    for (let i = 0; i < userIds.length; i += 100) {
      const { data, error } = await (supabase as any)
        .from('student_profiles')
        .select('user_id, enrollment_date')
        .in('user_id', userIds.slice(i, i + 100));
      if (error) throw error;
      for (const s of data ?? []) joinedAt[s.user_id] = s.enrollment_date;
    }
    const enrolled = recentUserIds.filter((id) => id in joinedAt).length;

    const kpis = {
      newRequests: requests.filter((r) => r.status === 'pending').length,
      today: requests.filter((r) => r.status === 'approved' && r.scheduled_start && istDateKey(new Date(r.scheduled_start)) === today).length,
      confirmedNext7: requests.filter((r) => {
        const t = startOf(r.scheduled_start);
        return r.status === 'approved' && t !== null && t >= now - 60 * 60 * 1000 && t <= in7;
      }).length,
      attendanceRate30: attended + noShow ? Math.round((attended / (attended + noShow)) * 100) : null,
      enrolled30: enrolled,
      requests30: recentUserIds.length,
    };

    return NextResponse.json({
      requests,
      kpis,
      followUps,
      joinedAt,
      settings: {
        hosts: settings.hosts,
        defaultTutorUpn: settings.defaultTutorUpn,
        defaultOrganizerUpn: settings.defaultOrganizerUpn,
        schedule: settings.schedule,
        drawingWhatsApp: settings.drawingWhatsApp,
      },
    });
  } catch (error) {
    console.error('demo-requests list failed:', error);
    return NextResponse.json({ error: 'Could not load demo requests' }, { status: 500 });
  }
}

class AddError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

function str(v: unknown, max = 200): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

const WINDOWS = new Set(['morning', 'afternoon', 'evening', 'anytime']);
const CLASSES = new Set(['10th', '11th', '12th', '12th-pass', 'other']);

/**
 * POST /api/demo-requests: staff add a demo for someone who reached us outside
 * the website (WhatsApp to the office, a call, a walk-in).
 *
 *   mode 'request': they want a demo; a New request (WhatsApp acknowledgement optional).
 *   mode 'agreed':  a time is already agreed; a Called request the desk then confirms.
 *   mode 'held':    the demo already happened (e.g. on Google Meet); recorded as
 *                   attended / no-show. An open request of theirs is closed out instead.
 *
 * The person is the picked user, else the one with this phone, else a new lead.
 */
export async function POST(req: Request) {
  const actorId = getRequestAdminId(req);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdminClient();
    const mode = body.mode;
    if (mode !== 'request' && mode !== 'agreed' && mode !== 'held') throw new AddError('Pick what happened.');
    const channel = str(body.channel, 40);
    const channelDef = STAFF_DEMO_CHANNELS.find((c) => c.id === channel);
    if (!channelDef) throw new AddError('Pick where they came from.');

    // Held + attended starts a follow-up: validate before anything is written (incl. a new person).
    const heldAttended = mode === 'held' && body.outcome !== 'no_show';
    const interest = ['hot', 'warm', 'cold'].includes(String(body.interest)) ? (body.interest as InterestLevel) : null;
    const nextAt = typeof body.nextFollowUpAt === 'string' ? new Date(body.nextFollowUpAt) : null;
    if (heldAttended && (!interest || !nextAt || Number.isNaN(nextAt.getTime()))) {
      throw new AddError('Pick how interested they are and the first follow-up date.');
    }

    // ---- Who
    const phone = demoPhone10(str(body.phone, 20));
    if (!phone) throw new AddError('Enter a 10-digit Indian mobile number.');
    const emailIn = str(body.email).toLowerCase();
    const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailIn) ? emailIn : null;
    let user: { id: string; name: string | null; email: string | null } | null = null;
    const pickedId = str(body.userId, 64);
    if (pickedId) {
      const { data } = await (supabase as any).from('users').select('id, name, email').eq('id', pickedId).maybeSingle();
      user = data ?? null;
      if (!user) throw new AddError('That person was not found. Search again.');
    } else {
      user = await getUserByPhone(phone, supabase);
    }
    const name = str(body.name, 100) || str(user?.name, 100);
    if (name.length < 2) throw new AddError('Enter the student name.');
    let createdPerson = false;
    if (!user) {
      user = await createUser(
        {
          name,
          email,
          phone: `+91${phone}`,
          username: null,
          avatar_url: null,
          firebase_uid: null,
          ms_oid: null,
          google_id: null,
          user_type: 'lead' as UserType,
          status: 'pending' as UserStatus,
          email_verified: false,
          phone_verified: false,
          preferred_language: 'en',
          last_login_at: null,
          metadata: { created_from: 'demo_desk', channel },
        } as any,
        supabase,
      );
      createdPerson = true;
    }
    const userId = user!.id;

    const parentPhone = demoPhone10(str(body.parentPhone, 20));
    const parentName = str(body.parentName, 100) || null;
    const currentClass = CLASSES.has(str(body.currentClass, 20)) ? str(body.currentClass, 20) : null;
    const base = {
      user_id: userId,
      name,
      email: email || user!.email || null,
      phone,
      current_class: currentClass,
      parent_joining: !!(parentPhone || parentName),
      parent_name: parentName,
      parent_phone: parentPhone,
      preferred_language: null,
      channel,
      page_code: STAFF_DEMO_PAGE_CODE,
    };
    const who = createdPerson ? ' (new person added to People)' : '';
    let row: DemoRequest;
    let sendNow = false;

    if (mode === 'held') {
      const at = new Date(str(body.heldAt, 40));
      if (Number.isNaN(at.getTime())) throw new AddError('Pick when the demo happened.');
      if (at.getTime() > Date.now() + 5 * 60_000) throw new AddError('That time is in the future. Use "Time already agreed" instead.');
      const platform = STAFF_DEMO_PLATFORMS.find((p) => p.id === str(body.platform, 20));
      if (!platform) throw new AddError('Pick where the demo happened.');
      const attended = heldAttended;
      const minutes = (await loadDemoSettings(supabase)).schedule.durationMinutes;
      const joinUrl = str(body.joinUrl, 500);
      const held = {
        status: (attended ? 'attended' : 'no_show') as DemoRequest['status'],
        attended,
        attendance_marked_at: new Date().toISOString(),
        scheduled_start: at.toISOString(),
        scheduled_minutes: minutes,
        teams_join_url: /^https:\/\//.test(joinUrl) ? joinUrl : null,
      };
      // Close out an open request (e.g. one booked on the website) instead of duplicating it.
      const open = await getActiveDemoRequestForUser(userId, supabase);
      if (open) {
        await updateDemoRequest(open.id, { ...held, next_contact_at: null }, supabase);
        await cancelPendingDemoMessages(open.id, undefined, supabase);
        row = { ...open, ...held };
      } else {
        row = await createDemoRequestWithRef(
          { ...base, preferred_date: istDateKey(at), preferred_window: 'anytime', ...held },
          supabase,
        );
      }
      await (supabase as any).from('demo_class_registrations').update({ attendance_marked_by: actorId }).eq('id', row.id);
      const note = str(body.note, 1000);
      await logDemoRequestEvent(
        {
          registration_id: row.id,
          kind: 'status',
          outcome: attended ? 'attended' : 'no_show',
          note: (
            `Held outside the desk on ${platform.label}, ${formatDemoDateTime(at)}. ` +
            (open ? 'Closed their open request. ' : `Added by staff from ${channelDef.label}${who}. `) +
            note
          ).trim(),
          actor_id: actorId,
        },
        supabase,
      );
      await openDemoFollowUp(
        attended
          ? { userId, demoRegistrationId: row.id, kind: 'post_demo', dueAt: nextAt!, interest, note: note || null, actorId }
          : { userId, demoRegistrationId: row.id, kind: 'demo_rebook', dueAt: rebookFollowUpAt(new Date()), actorId },
        supabase,
      );
      if (body.sendFollowUp === true) {
        const now = new Date();
        await enqueueDemoMessages(
          row,
          [attended ? { kind: 'thanks', sendAfter: thanksSendAfter(at, minutes, now) } : { kind: 'missed', sendAfter: now }],
          supabase,
        );
        sendNow = true;
      }
    } else {
      const window = (mode === 'agreed' ? 'anytime' : str(body.window, 20)) as DemoWindow;
      if (!WINDOWS.has(window)) throw new AddError('Pick a time of day, or Any time.');
      const date = window === 'anytime' ? null : str(body.date, 10) || null;
      if (window !== 'anytime' && !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new AddError('Pick a day.');
      try {
        row = await createDemoRequestWithRef(
          { ...base, preferred_date: date, preferred_window: window, ...(mode === 'agreed' ? { status: 'contacted' as const } : {}) },
          supabase,
        );
      } catch (err) {
        if (!(err instanceof DemoActiveRequestError)) throw err;
        const open = await getActiveDemoRequestForUser(userId, supabase);
        throw new AddError(
          `${name} already has an open request${open?.ref_code ? ` (${open.ref_code})` : ''}. Open it from the desk instead.`,
          409,
          { existingId: open?.id ?? null },
        );
      }
      await logDemoRequestEvent(
        {
          registration_id: row.id,
          kind: 'status',
          outcome: mode === 'agreed' ? 'contacted' : 'requested',
          note: `Added by staff from ${channelDef.label}${who}.${mode === 'agreed' ? ' Time agreed, confirm it next.' : ''}`,
          actor_id: actorId,
        },
        supabase,
      );
      if (mode === 'request' && body.sendAck !== false) {
        await enqueueDemoMessages(row, [{ kind: 'received', sendAfter: new Date() }], supabase);
        sendNow = true;
      }
    }

    if (sendNow) {
      await sendDueDemoMessages({ origin: demoMarketingOrigin(req.url), registrationId: row.id }).catch((err) =>
        console.error('demo add send failed:', err),
      );
    }
    return NextResponse.json({ id: row.id, ref: row.ref_code, createdPerson });
  } catch (error) {
    if (error instanceof AddError) {
      return NextResponse.json({ error: error.message, ...error.extra }, { status: error.status });
    }
    console.error('demo add failed:', error);
    return NextResponse.json({ error: 'Could not add the demo. Try again.' }, { status: 500 });
  }
}
