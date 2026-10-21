export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import {
  isUpnAvailable,
  isValidUsername,
  normalizeUsername,
  readStudentAccountDefaults,
  upnFor,
  usernameWithSuffix,
} from '@neram/auth/student-accounts';
import { actingAdminId } from '@/lib/fee-request';

/** GET ?username=Radhika_Bhanuprakash: is that login ID free? Suggests the next free one when not. */
export async function GET(request: NextRequest) {
  if (!actingAdminId(request)) return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
  const username = normalizeUsername(request.nextUrl.searchParams.get('username'));
  if (!isValidUsername(username)) {
    return NextResponse.json({
      success: true,
      data: { username, valid: false, available: false, upn: null, alternative: null },
    });
  }
  const { defaults } = await readStudentAccountDefaults(getSupabaseAdminClient());
  const upn = upnFor(username, defaults.domain);
  const free = await isUpnAvailable(upn);
  if (!free.ok) {
    return NextResponse.json({ error: free.error.fix ? `${free.error.message} ${free.error.fix}` : free.error.message }, { status: 502 });
  }
  let alternative: string | null = null;
  if (!free.value) {
    for (let attempt = 2; attempt <= 6 && !alternative; attempt++) {
      const next = usernameWithSuffix(username, attempt);
      const check = await isUpnAvailable(upnFor(next, defaults.domain));
      if (check.ok && check.value) alternative = next;
    }
  }
  return NextResponse.json({ success: true, data: { username, valid: true, available: free.value, upn, alternative } });
}
