export const dynamic = 'force-dynamic';

import { randomInt } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, recordUserHistory } from '@neram/database';
import { generateTempPassword, resetEntraPassword, startPassword } from '@neram/auth/student-accounts';
import { UUID_REGEX, actingAdminId } from '@/lib/fee-request';
import { readClassAccountSetup, readClassAccountStudent } from '@/lib/class-account-store';
import { buildClassAccountView } from '@/lib/class-account-view';
import { UPSTREAM_FAILED } from '@/lib/upstream-status';

/**
 * POST: back to the start password (Radhika@123) with a forced change at the
 * next sign-in, for a student who forgot theirs. The setup guide shows it again
 * until they choose a new one.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => ({}));
  const adminId = actingAdminId(request, body);
  if (!adminId) return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
  if (!UUID_REGEX.test(params.id)) return NextResponse.json({ error: 'Invalid student.' }, { status: 400 });

  try {
    const supabase = getSupabaseAdminClient() as any;
    const [student, setup] = await Promise.all([readClassAccountStudent(supabase, params.id), readClassAccountSetup(supabase, params.id)]);
    if (!student) return NextResponse.json({ error: 'That student was not found.' }, { status: 404 });
    if (student.isStaff) return NextResponse.json({ error: 'Staff passwords are managed in Azure.' }, { status: 409 });
    const msOid = setup?.msOid || student.msOid;
    if (!msOid) return NextResponse.json({ error: 'This student has no class account yet. Set it up first.' }, { status: 409 });

    let password = startPassword(student.firstName);
    let mode: 'start' | 'random' = 'start';
    let reset = password ? await resetEntraPassword(msOid, password) : null;
    if (!reset || (!reset.ok && /password/i.test(reset.error.raw || ''))) {
      password = generateTempPassword((max) => randomInt(max));
      mode = 'random';
      reset = await resetEntraPassword(msOid, password);
    }
    if (!reset.ok) {
      return NextResponse.json({ error: reset.error.fix ? `${reset.error.message} ${reset.error.fix}` : reset.error.message }, { status: UPSTREAM_FAILED });
    }

    if (setup) {
      await supabase
        .from('class_account_setups')
        .update({ password_reset_at: new Date().toISOString(), password_changed_at: null, password_mode: mode, updated_at: new Date().toISOString() })
        .eq('user_id', params.id);
    }
    try {
      await recordUserHistory(supabase, params.id, 'microsoft_password_reset', null, { mode }, adminId);
    } catch {
      /* the reset happened; a missing audit row must not hide it */
    }

    return NextResponse.json(
      { success: true, data: await buildClassAccountView(supabase, params.id), password: mode === 'random' ? password : null },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error: any) {
    console.error('[class-account] reset failed:', error?.message);
    return NextResponse.json({ error: error?.message || 'Could not reset the password.' }, { status: 500 });
  }
}
