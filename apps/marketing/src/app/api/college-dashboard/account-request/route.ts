export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * POST /api/college-dashboard/account-request (public)
 * "Request an account" from the dashboard sign-in page. Staff see it in
 * Admin > College Hub > Accounts and create the account from there.
 * `website` is a honeypot: people never fill it, bots do.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  if (body.website) return NextResponse.json({ success: true });

  const text = (k: string, max: number) => String(body[k] ?? '').trim().slice(0, max);
  const collegeName = text('college_name', 160);
  const name = text('name', 80);
  const email = text('email', 160).toLowerCase();
  const phone = text('phone', 20);
  const designation = text('designation', 80);
  const message = text('message', 1000);

  const fields: Record<string, string> = {};
  if (!collegeName) fields.college_name = 'Enter your college name';
  if (!name) fields.name = 'Enter your name';
  if (!EMAIL.test(email)) fields.email = 'Enter a valid email address';
  if (phone && !/^[+()\d\s-]{6,20}$/.test(phone)) fields.phone = 'Enter a valid phone number';
  if (Object.keys(fields).length) return NextResponse.json({ error: 'Some fields need a fix.', fields }, { status: 422 });

  const db = createAdminClient() as any;
  const { count } = await db
    .from('college_account_requests')
    .select('id', { count: 'exact', head: true })
    .ilike('email', email)
    .eq('status', 'pending');
  if ((count ?? 0) >= 1) return NextResponse.json({ success: true, duplicate: true });

  const { error } = await db.from('college_account_requests').insert({
    college_name: collegeName,
    name,
    email,
    phone: phone || null,
    designation: designation || null,
    message: message || null,
  });
  if (error) return NextResponse.json({ error: 'Could not send the request. Please try again.' }, { status: 500 });
  return NextResponse.json({ success: true });
}
