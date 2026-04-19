import { NextRequest, NextResponse } from 'next/server';
import {
  COOKIE_MAX_AGE_SECONDS,
  STAFF_COOKIE_NAME,
  signStaffSession,
  verifyAdminSecret,
} from '@/lib/admin/staff-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface LoginBody {
  secret?: string;
  name?: string;
  email?: string;
}

export async function POST(req: NextRequest) {
  let body: LoginBody;
  try {
    body = (await req.json()) as LoginBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { secret, name, email } = body;
  if (!secret || !name || !email) {
    return NextResponse.json(
      { error: 'secret, name, and email are required' },
      { status: 400 },
    );
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
  }
  if (name.trim().length < 2) {
    return NextResponse.json({ error: 'Name too short' }, { status: 400 });
  }

  if (!verifyAdminSecret(secret)) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
  }

  const cookieValue = signStaffSession({ name: name.trim(), email: email.trim().toLowerCase() });
  const res = NextResponse.json({ success: true, name: name.trim(), email: email.trim().toLowerCase() });
  res.cookies.set(STAFF_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
  return res;
}
