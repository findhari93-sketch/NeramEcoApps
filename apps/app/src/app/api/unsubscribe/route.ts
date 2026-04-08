// apps/app/src/app/api/unsubscribe/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyUnsubscribeToken, getSupabaseAdminClient, cancelPendingPhoneDrip } from '@neram/database';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(new URL('/unsubscribed?error=missing_token', req.url));
  }

  const payload = verifyUnsubscribeToken(token);

  if (!payload) {
    return NextResponse.redirect(new URL('/unsubscribed?error=invalid_token', req.url));
  }

  try {
    const supabase = getSupabaseAdminClient();

    const { error: updateError } = await (supabase as any)
      .from('users')
      .update({
        email_opt_out: true,
        email_opt_out_at: new Date().toISOString(),
      })
      .eq('id', payload.userId);

    if (updateError) {
      console.error('Unsubscribe DB update error:', updateError);
      return NextResponse.redirect(new URL('/unsubscribed?error=server_error', req.url));
    }

    await cancelPendingPhoneDrip(payload.userId, supabase);

    return NextResponse.redirect(new URL('/unsubscribed', req.url));
  } catch (err) {
    console.error('Unsubscribe error:', err);
    return NextResponse.redirect(new URL('/unsubscribed?error=server_error', req.url));
  }
}
