export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  createDemoRequest,
  getActiveDemoRequestForUser,
  enqueueDemoMessages,
  enqueueDemoStaffMessages,
  staffUserIdsByUpn,
  notifyDemoRequest,
  isOfferedPreference,
  formatDemoPreference,
  makeDemoRefCode,
  makeDemoJoinToken,
  demoPhone10,
  type DemoWindow,
} from '@neram/database';
import { verifyFirebaseToken } from '../../_lib/auth';
import { saveLeadTouch } from '@/lib/lead-touch';
import { loadDemoSettings, toPublicDemoRequest } from '@/lib/demo-request';

const CLASSES = new Set(['10th', '11th', '12th', '12th-pass', 'other']);
const LANGS = new Set(['en', 'ta', 'kn', 'hi', 'ml', 'te']);
const INTERESTS = new Set(['nata', 'jee_paper2', 'both']);
const WINDOWS = new Set(['morning', 'afternoon', 'evening', 'anytime']);

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/**
 * POST /api/demo-class/request
 *
 * Book a free demo: a day + window (or "any time"), a few details, and the
 * signed-in student's verified phone and email. Staff call to confirm the
 * exact time. One open request per person.
 *
 * 401 SIGN_IN_REQUIRED, 428 PHONE_REQUIRED (signed in but phone not verified),
 * 409 ACTIVE_REQUEST (returns the open one), 400 for an unavailable time.
 */
export async function POST(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (!auth) return NextResponse.json({ error: 'SIGN_IN_REQUIRED' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { data: user } = await (supabase as any)
      .from('users')
      .select('id, phone, phone_verified, email, name')
      .eq('id', auth.userId)
      .single();
    const phone = user?.phone_verified ? demoPhone10(user.phone) : null;
    if (!phone) return NextResponse.json({ error: 'PHONE_REQUIRED' }, { status: 428 });

    const settings = await loadDemoSettings();

    const existing = await getActiveDemoRequestForUser(auth.userId, supabase);
    if (existing) {
      return NextResponse.json(
        { error: 'ACTIVE_REQUEST', request: toPublicDemoRequest(existing, settings) },
        { status: 409 },
      );
    }

    const window = str(body.window, 20) as DemoWindow;
    const date = window === 'anytime' ? null : str(body.date, 10) || null;
    if (!WINDOWS.has(window) || !isOfferedPreference(new Date(), date, window, settings.schedule)) {
      return NextResponse.json(
        { error: 'That time is no longer available. Please pick another.' },
        { status: 400 },
      );
    }

    // The typed name wins: a parent may book for their child.
    const name = str(body.name, 100) || str(user?.name, 100) || str(auth.name, 100);
    if (name.length < 2) return NextResponse.json({ error: 'Please enter the student name.' }, { status: 400 });

    const currentClass = CLASSES.has(str(body.currentClass, 20)) ? str(body.currentClass, 20) : null;
    const language = LANGS.has(str(body.language, 5)) ? str(body.language, 5) : null;
    const interest = INTERESTS.has(str(body.interestCourse, 20)) ? str(body.interestCourse, 20) : null;
    const parentJoining = body.parentJoining === true;
    const parentPhone = parentJoining ? demoPhone10(str(body.parentPhone, 20)) : null;
    const parentName = parentJoining ? str(body.parentName, 100) || null : null;

    // A ref clash is astronomically rare but cheap to retry.
    let created = null;
    for (let attempt = 0; attempt < 3 && !created; attempt++) {
      try {
        created = await createDemoRequest(
          {
            user_id: auth.userId,
            ref_code: makeDemoRefCode(),
            join_token: makeDemoJoinToken(),
            name,
            email: user?.email || auth.email || null,
            phone,
            current_class: currentClass,
            interest_course: interest,
            preferred_date: date,
            preferred_window: window,
            parent_joining: parentJoining,
            parent_name: parentName,
            parent_phone: parentPhone,
            preferred_language: language,
          },
          supabase,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? '');
        if (msg.includes('one_active_per_user')) {
          const open = await getActiveDemoRequestForUser(auth.userId, supabase);
          return NextResponse.json(
            { error: 'ACTIVE_REQUEST', request: open ? toPublicDemoRequest(open, settings) : null },
            { status: 409 },
          );
        }
        if (!msg.includes('ref_code') || attempt === 2) throw err;
      }
    }
    if (!created) throw new Error('could not create demo request');

    await saveLeadTouch(supabase as any, 'demo_class_registrations', created.id, body);

    // Neram Assistant pings whoever on the demo team takes new requests (the caller).
    const callers = settings.hosts.filter((h) => h.notifyNewRequests).map((h) => h.upn);
    const callerIds: Record<string, string> = callers.length
      ? await staffUserIdsByUpn(callers, supabase).catch(() => ({}))
      : {};

    await Promise.allSettled([
      enqueueDemoMessages(created, [{ kind: 'received', sendAfter: new Date() }], supabase),
      enqueueDemoStaffMessages(
        created.id,
        Object.values(callerIds).map((userId) => ({ userId, kind: 'staff_new_request' as const, sendAfter: new Date() })),
        supabase,
      ),
      notifyDemoRequest({
        userName: name,
        phone,
        email: created.email,
        refCode: created.ref_code || '',
        preference: formatDemoPreference(date, window, settings.schedule),
        parentJoining,
        currentClass,
        registrationId: created.id,
      }),
    ]);

    return NextResponse.json({ request: toPublicDemoRequest(created, settings) });
  } catch (error) {
    console.error('demo request failed:', error);
    return NextResponse.json({ error: 'We could not save your request. Please try again.' }, { status: 500 });
  }
}
