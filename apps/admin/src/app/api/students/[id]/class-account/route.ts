export const dynamic = 'force-dynamic';
// Creating the account, licensing it and adding it to Teams is several Graph calls.
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, recordUserHistory } from '@neram/database';
import { provisionClassAccount, setEntraName } from '@neram/auth/student-accounts';
import { UUID_REGEX, actingAdminId } from '@/lib/fee-request';
import { createClassAccountPorts, readClassAccountStudent } from '@/lib/class-account-store';
import { buildClassAccountView } from '@/lib/class-account-view';

/** GET: the student's class account, or the ID staff would create. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  if (!actingAdminId(request)) return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
  if (!UUID_REGEX.test(params.id)) return NextResponse.json({ error: 'Invalid student.' }, { status: 400 });
  try {
    const view = await buildClassAccountView(getSupabaseAdminClient(), params.id);
    if (!view) return NextResponse.json({ error: 'That student was not found.' }, { status: 404 });
    return NextResponse.json({ success: true, data: view });
  } catch (error: any) {
    console.error('[class-account] GET failed:', error);
    return NextResponse.json({ error: error?.message || 'Could not load the class account.' }, { status: 500 });
  }
}

/**
 * POST { username?, resendWelcome?, adopt?, syncName? }
 * Creates the class account, or carries on from the step that failed last time.
 * adopt: the record already has a Microsoft account; keep it, never make a second
 * one, and send no welcome email. syncName: put first and last name on the account.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => ({}));
  const adminId = actingAdminId(request, body);
  if (!adminId) return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
  if (!UUID_REGEX.test(params.id)) return NextResponse.json({ error: 'Invalid student.' }, { status: 400 });

  try {
    const supabase = getSupabaseAdminClient();

    if (body?.syncName === true) {
      const student = await readClassAccountStudent(supabase, params.id);
      if (!student?.msOid) return NextResponse.json({ error: 'There is no Microsoft account on this record yet.' }, { status: 409 });
      const named = await setEntraName(student.msOid, { givenName: student.firstName, surname: student.lastName });
      if (!named.ok) {
        const message = named.error.fix ? `${named.error.message} ${named.error.fix}` : named.error.message;
        return NextResponse.json({ error: message }, { status: named.status >= 400 ? named.status : 502 });
      }
      const name = [student.firstName, student.lastName].filter(Boolean).join(' ');
      await recordUserHistory(supabase, params.id, 'class_account_name', null, name, adminId).catch(() => {});
      return NextResponse.json({ success: true, data: await buildClassAccountView(supabase, params.id), name });
    }

    const ports = createClassAccountPorts(supabase, adminId);
    if (body?.adopt === true) {
      const student = await readClassAccountStudent(supabase, params.id);
      if (!student?.msOid) return NextResponse.json({ error: 'There is no Microsoft account on this record to keep.' }, { status: 409 });
    }
    const result = await provisionClassAccount(ports, {
      userId: params.id,
      username: typeof body?.username === 'string' ? body.username : null,
      actorId: adminId,
      resendWelcome: body?.resendWelcome === true,
      welcome: body?.adopt === true ? false : undefined,
    });

    if (result.kind === 'invalid' || result.kind === 'conflict') {
      return NextResponse.json({ error: result.error, code: result.kind === 'conflict' ? result.code : 'invalid' }, { status: result.status });
    }
    const view = await buildClassAccountView(supabase, params.id);
    if (result.kind === 'graph_failed') {
      const message = result.error.fix ? `${result.error.message} ${result.error.fix}` : result.error.message;
      return NextResponse.json({ error: message, code: result.error.code, data: view }, { status: result.status >= 400 ? result.status : 502 });
    }
    return NextResponse.json(
      // A random password only exists when Microsoft refused the start one. Shown once, never saved.
      { success: true, data: view, password: result.password, complete: result.complete },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error: any) {
    console.error('[class-account] POST failed:', error?.message);
    return NextResponse.json({ error: error?.message || 'Could not set up the class account.' }, { status: 500 });
  }
}
