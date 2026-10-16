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
  logDemoRequestEvent,
  enqueueDemoMessages,
  demoPhone10,
  listDemoFollowUpsByDemo,
  type DemoRequest,
  type TypedSupabaseClient,
  type DemoWindow,
  type UserType,
  type UserStatus,
} from '@neram/database';
import { getRequestAdminId } from '@/lib/request-admin';
import { loadDemoSettings, demoMarketingOrigin, sendDueDemoMessages } from '@/lib/demo/server';
import { DEFAULT_HELD_TUTOR, STAFF_DEMO_CHANNELS, STAFF_DEMO_PAGE_CODE } from '@/lib/demo/staff-add';
import { DemoTeamsError } from '@/lib/demo/teams';
import { HeldDemoError, parseHeldDemoWithSettings, recordHeldDemo } from '@/lib/demo/record-held';
import { ConfirmError, confirmDemo, meetingUrl, parseMeetingKind, type ConfirmInput } from '@/lib/demo/confirm';

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
      // After-demo follow-ups due by the end of today (IST), overdue included.
      followUpsDue: Object.values(followUps).filter(
        (f) => ['pending', 'scheduled', 'attempted'].includes(f.status) && !!f.scheduled_callback_at && istDateKey(new Date(f.scheduled_callback_at)) <= today,
      ).length,
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

/**
 * A person staff picked in Add demo. Fill only what their record is missing
 * (never overwrite), and remember on the account whether it is the parent's.
 * Email and phone are unique on users, so a clash is skipped, not fatal.
 */
async function updatePickedPerson(
  supabase: TypedSupabaseClient,
  user: { id: string; email: string | null; phone: string | null; metadata: Record<string, unknown> | null },
  accountHolder: 'student' | 'parent',
  typed: { email: string | null; phone: string },
): Promise<void> {
  const patch: Record<string, unknown> = {};
  // On a parent's account the typed email and mobile are usually the student's.
  if (accountHolder === 'student') {
    if (!user.email && typed.email) patch.email = typed.email;
    if (!user.phone) patch.phone = `+91${typed.phone}`;
  }
  const meta = user.metadata ?? {};
  if ((meta.account_holder ?? 'student') !== accountHolder) patch.metadata = { ...meta, account_holder: accountHolder };
  if (!Object.keys(patch).length) return;
  const { error } = await (supabase as any).from('users').update(patch).eq('id', user.id);
  if (!error) return;
  console.warn('demo add: person update skipped:', error.message);
  if (patch.metadata) {
    await (supabase as any).from('users').update({ metadata: patch.metadata }).eq('id', user.id);
  }
}

/**
 * Add demo, "Demo planned": validated before anything is written. The team is
 * everyone in Demo settings; the tutor defaults to Haribabu when he is on it.
 */
async function parsePlanned(body: Record<string, unknown>, supabase: TypedSupabaseClient) {
  const settings = await loadDemoSettings(supabase);
  if (!settings.hosts.length) throw new AddError('Add the demo team in Demo settings first.');
  const start = new Date(str(body.start, 40));
  if (Number.isNaN(start.getTime())) throw new AddError('Pick the date and time of the demo.');
  if (start.getTime() < Date.now() - 5 * 60_000) throw new AddError('That time has passed. Use "Demo already held" instead.');
  const meeting = parseMeetingKind(body.meeting);
  const joinUrl = meeting === 'own_link' ? meetingUrl(body.joinUrl) : null;
  if (meeting === 'own_link' && !joinUrl) throw new AddError('Paste the full meeting link, starting with https://');
  const hostUpns = settings.hosts.map((h) => h.upn.toLowerCase());
  const picked = str(body.tutorUpn, 200).toLowerCase();
  const tutorUpn = picked || (hostUpns.includes(DEFAULT_HELD_TUTOR.upn) ? DEFAULT_HELD_TUTOR.upn : settings.defaultTutorUpn || hostUpns[0]);
  if (!hostUpns.includes(tutorUpn)) throw new AddError('Pick who takes the demo from the demo team.');
  const input: ConfirmInput = {
    start,
    minutes: settings.schedule.durationMinutes,
    reason: null,
    teamUpns: [],
    tutorUpn,
    organizerUpn: '',
    meeting,
    joinUrl,
    conflictNote: str(body.conflictNote, 500) || null,
  };
  return { settings, input };
}

const WINDOWS = new Set(['morning', 'afternoon', 'evening', 'anytime']);
const CLASSES = new Set(['10th', '11th', '12th', '12th-pass', 'other']);

/**
 * POST /api/demo-requests: staff add a demo for someone who reached us outside
 * the website (WhatsApp to the office, a call, a walk-in).
 *
 *   mode 'request': they want a demo; a New request (WhatsApp acknowledgement optional).
 *   mode 'planned': a demo planned on WhatsApp or a call: date, time, tutor and how they
 *                   meet (Teams, own link, link later, in person). Confirmed in one go.
 *   mode 'agreed':  older clients: a Called request the desk then confirms.
 *   mode 'held':    the demo already happened (e.g. on Google Meet); recorded as
 *                   attended / no-show. An open request of theirs is closed out instead.
 *
 * The person is the picked user, else the one with this phone, else a new lead.
 * accountHolder 'parent': the picked account is the parent's; the row still
 * carries the student's name and number.
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
    if (mode !== 'request' && mode !== 'agreed' && mode !== 'held' && mode !== 'planned') throw new AddError('Pick what happened.');
    const channel = str(body.channel, 40);
    const channelDef = STAFF_DEMO_CHANNELS.find((c) => c.id === channel);
    if (!channelDef) throw new AddError('Pick where they came from.');

    // Validate the held-demo fields before anything is written (incl. a new person).
    const heldParsed = mode === 'held' ? await parseHeldDemoWithSettings(body, supabase) : null;
    const planned = mode === 'planned' ? await parsePlanned(body, supabase) : null;

    // ---- Who
    const phone = demoPhone10(str(body.phone, 20));
    if (!phone) throw new AddError('Enter a 10-digit Indian mobile number.');
    const emailIn = str(body.email).toLowerCase();
    const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailIn) ? emailIn : null;
    let user: { id: string; name: string | null; email: string | null; phone: string | null; metadata: Record<string, unknown> | null } | null = null;
    const pickedId = str(body.userId, 64);
    if (pickedId) {
      const { data } = await (supabase as any).from('users').select('id, name, email, phone, metadata').eq('id', pickedId).maybeSingle();
      user = data ?? null;
      if (!user) throw new AddError('That person was not found. Search again.');
    } else {
      const found = await getUserByPhone(phone, supabase);
      user = found ? { id: found.id, name: found.name, email: found.email, phone: found.phone, metadata: (found.metadata as Record<string, unknown>) ?? null } : null;
    }
    // "This is the parent's account" only means something for a person staff picked.
    const accountHolder: 'student' | 'parent' = pickedId && body.accountHolder === 'parent' ? 'parent' : 'student';
    const name = str(body.name, 100) || (accountHolder === 'student' ? str(user?.name, 100) : '');
    if (name.length < 2) throw new AddError('Enter the student name.');
    let createdPerson = false;
    if (!user) {
      const created = await createUser(
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
      user = { id: created.id, name: created.name, email: created.email, phone: created.phone, metadata: null };
      createdPerson = true;
    } else if (pickedId) {
      await updatePickedPerson(supabase, user, accountHolder, { email, phone });
    }
    const userId = user!.id;

    const parentPhone = demoPhone10(str(body.parentPhone, 20));
    const parentName = str(body.parentName, 100) || null;
    const currentClass = CLASSES.has(str(body.currentClass, 20)) ? str(body.currentClass, 20) : null;
    const base = {
      user_id: userId,
      name,
      email: email || (accountHolder === 'student' ? user!.email : null) || null,
      phone,
      current_class: currentClass,
      parent_joining: !!(parentPhone || parentName),
      parent_name: parentName,
      parent_phone: parentPhone,
      preferred_language: null,
      channel,
      page_code: STAFF_DEMO_PAGE_CODE,
      account_holder: accountHolder,
    };
    const who = createdPerson ? ' (new person added to People)' : '';
    let row: DemoRequest;
    let sendNow = false;

    if (heldParsed) {
      // Close out an open request (e.g. one booked on the website) instead of duplicating it.
      const open = await getActiveDemoRequestForUser(userId, supabase);
      // What staff typed lands on that request too; its own channel and page code stay.
      const patch: Partial<DemoRequest> = {
        name,
        phone,
        account_holder: accountHolder,
        ...(currentClass ? { current_class: currentClass } : {}),
        ...(email ? { email } : {}),
        ...(parentName || parentPhone ? { parent_joining: true, parent_name: parentName, parent_phone: parentPhone } : {}),
      };
      const res = await recordHeldDemo({
        supabase,
        actorId,
        userId,
        held: heldParsed.held,
        minutes: heldParsed.settings.schedule.durationMinutes,
        tutorName: heldParsed.tutorName,
        existing: open,
        create: base,
        patch,
        source: open ? `Closed their open request.` : `Added by staff from ${channelDef.label}${who}.`,
      });
      row = res.row;
      sendNow = res.queued;
    } else if (planned) {
      try {
        row = await createDemoRequestWithRef(
          { ...base, preferred_date: istDateKey(planned.input.start), preferred_window: 'anytime', status: 'contacted' },
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
          outcome: 'contacted',
          note: `Planned by staff from ${channelDef.label}${who}.${accountHolder === 'parent' ? " Linked to the parent's account." : ''}`,
          actor_id: actorId,
        },
        supabase,
      );
      try {
        const res = await confirmDemo({ supabase, actorId, r: row, settings: planned.settings, input: planned.input, origin: demoMarketingOrigin(req.url) });
        sendNow = res.sendNow;
      } catch (err) {
        // The person and request are saved; staff finish Confirm from the desk.
        if (!(err instanceof ConfirmError) && !(err instanceof DemoTeamsError)) throw err;
        return NextResponse.json({ id: row.id, ref: row.ref_code, createdPerson, confirmError: err.message });
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
          note: `Added by staff from ${channelDef.label}${who}.${accountHolder === 'parent' ? " Linked to the parent's account." : ''}${mode === 'agreed' ? ' Time agreed, confirm it next.' : ''}`,
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
    if (error instanceof HeldDemoError || error instanceof ConfirmError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('demo add failed:', error);
    return NextResponse.json({ error: 'Could not add the demo. Try again.' }, { status: 500 });
  }
}
