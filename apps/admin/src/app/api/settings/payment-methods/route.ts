export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import {
  getPaymentMethods,
  savePaymentMethods,
  getPaymentWatchers,
  savePaymentWatchers,
  parsePaymentMethods,
  parsePaymentWatchers,
  watcherHealth,
} from '@neram/database/payments';
import { actingAdminId } from '@/lib/fee-request';

/** GET: the method switches, the Instant UPI policy, the watcher settings and who was heard from. */
export async function GET(request: Request) {
  if (!actingAdminId(request)) return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
  try {
    const supabase = getSupabaseAdminClient();
    const [methods, watchers] = await Promise.all([getPaymentMethods(supabase), getPaymentWatchers(supabase)]);
    const health = await watcherHealth(supabase, methods.upiAuto.silentAfterMinutes);
    return NextResponse.json({ methods, watchers, health }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: any) {
    console.error('[payment-methods] load failed:', error?.message);
    return NextResponse.json({ error: 'Could not load the payment methods.' }, { status: 500 });
  }
}

/**
 * PUT { methods, watchers }: replace both. The parsers clamp every number and
 * fall back to the defaults, so a bad value can never switch Instant UPI into
 * an unsafe shape (no cap, no silence window).
 */
export async function PUT(request: Request) {
  const body = await request.json().catch(() => null);
  const adminId = actingAdminId(request, body);
  if (!adminId) return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  const fieldErrors: Record<string, string> = {};
  const tail = body?.watchers?.accountTail;
  if (tail && !/^\d{4}$/.test(String(tail).trim())) fieldErrors.accountTail = 'The last four digits of the account, or leave it empty.';
  const live = body?.methods?.upiAuto?.enabled === true && body?.methods?.upiAuto?.shadowMode === false;
  const devices = Array.isArray(body?.watchers?.deviceIds) ? body.watchers.deviceIds.filter((d: unknown) => typeof d === 'string' && d.trim()) : [];
  if (live && devices.length === 0) fieldErrors.deviceIds = 'Add at least one watcher device id before taking Instant UPI live.';
  if (Object.keys(fieldErrors).length) return NextResponse.json({ error: 'Check the highlighted fields.', fieldErrors }, { status: 400 });

  try {
    const supabase = getSupabaseAdminClient();
    const methods = parsePaymentMethods(body.methods);
    const watchers = parsePaymentWatchers(body.watchers);
    await Promise.all([savePaymentMethods(supabase, methods, adminId), savePaymentWatchers(supabase, watchers, adminId)]);
    const health = await watcherHealth(supabase, methods.upiAuto.silentAfterMinutes);
    return NextResponse.json({ success: true, methods, watchers, health });
  } catch (error: any) {
    console.error('[payment-methods] save failed:', error?.message);
    return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 500 });
  }
}
