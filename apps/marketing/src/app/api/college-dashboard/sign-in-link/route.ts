export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { makeSignInLink } from '@/lib/college-dashboard/invite';
import { sendDashboardEmail, simpleEmail, siteOrigin } from '@/lib/college-dashboard/email';

/**
 * POST /api/college-dashboard/sign-in-link {email} (public)
 * "Forgot password / email me a link". Sends a one-time sign-in link when the
 * email belongs to an active college account. The answer is the same either
 * way, so the form never reveals which emails have accounts.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const email = String(body.email ?? '').trim().toLowerCase();
  const reply = NextResponse.json({ success: true });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return reply;

  try {
    const db = createAdminClient() as any;
    const { data: person } = await db
      .from('college_admins')
      .select('id, name, is_active, colleges!college_admins_college_id_fkey(name)')
      .ilike('email', email)
      .maybeSingle();
    if (!person?.is_active) return reply;

    const { link, userId } = await makeSignInLink(db, email, person.name, siteOrigin(request.nextUrl.origin));
    await db.from('college_admins').update({ supabase_uid: userId }).eq('id', person.id);
    await sendDashboardEmail(
      email,
      'Your sign-in link for the college dashboard',
      simpleEmail({
        heading: 'Sign in to your college dashboard',
        lines: [`Hello ${person.name},`, `Use the button below to sign in to the ${person.colleges?.name ?? 'college'} dashboard. You can choose a new password after you sign in.`],
        button: { label: 'Sign in', href: link },
        footnote: 'The link works once and expires in 24 hours. If you did not ask for it, you can ignore this email.',
      })
    );
  } catch (e) {
    console.warn('[sign-in-link]', (e as Error).message);
  }
  return reply;
}
