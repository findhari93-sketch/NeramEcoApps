export const dynamic = 'force-dynamic';

/**
 * Phone alerts (Web Push) for the signed-in staff member's devices.
 *
 * GET     the VAPID public key and this person's subscribed devices
 * POST    { endpoint, keys: { p256dh, auth }, label } adds or moves a device to them
 * DELETE  ?id=<row id> removes one of their devices
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { webPushPublicKey } from '@neram/database/staff-push';
import { getRequestAdminId } from '@/lib/request-admin';

const NO_STORE = { 'Cache-Control': 'no-store' };

function isPushEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 1000) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isKey(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 && /^[A-Za-z0-9_\-=]+$/.test(value);
}

export async function GET(request: NextRequest) {
  const adminId = getRequestAdminId(request);
  if (!adminId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const supabase = getSupabaseAdminClient() as any;
  const { data, error } = await supabase
    .from('admin_push_subscriptions')
    .select('id, endpoint, device_label, created_at, last_success_at, failure_count')
    .eq('user_id', adminId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[push] list failed:', error.message);
    return NextResponse.json({ error: 'Could not load your devices' }, { status: 500 });
  }
  return NextResponse.json(
    { publicKey: webPushPublicKey(), devices: data ?? [] },
    { headers: NO_STORE },
  );
}

export async function POST(request: NextRequest) {
  const adminId = getRequestAdminId(request);
  if (!adminId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;
  if (!isPushEndpoint(endpoint) || !isKey(p256dh) || !isKey(auth)) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
  }
  const label = typeof body?.label === 'string' ? body.label.trim().slice(0, 80) || null : null;

  const supabase = getSupabaseAdminClient() as any;
  // One row per endpoint: a shared phone that changes hands moves to the new person.
  const { data, error } = await supabase
    .from('admin_push_subscriptions')
    .upsert(
      {
        user_id: adminId,
        endpoint,
        p256dh,
        auth,
        device_label: label,
        user_agent: request.headers.get('user-agent')?.slice(0, 300) ?? null,
        failure_count: 0,
      },
      { onConflict: 'endpoint' },
    )
    .select('id, endpoint, device_label, created_at, last_success_at, failure_count')
    .single();
  if (error) {
    console.error('[push] subscribe failed:', error.message);
    return NextResponse.json({ error: 'Could not save this device' }, { status: 500 });
  }
  return NextResponse.json({ device: data }, { headers: NO_STORE });
}

export async function DELETE(request: NextRequest) {
  const adminId = getRequestAdminId(request);
  if (!adminId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const id = request.nextUrl.searchParams.get('id');
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Device id is required' }, { status: 400 });
  }
  const supabase = getSupabaseAdminClient() as any;
  const { error } = await supabase
    .from('admin_push_subscriptions')
    .delete()
    .eq('id', id)
    .eq('user_id', adminId);
  if (error) {
    console.error('[push] remove failed:', error.message);
    return NextResponse.json({ error: 'Could not remove this device' }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
