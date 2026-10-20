export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { recordHeartbeat } from '@neram/database/payments';
import { authenticateWatcher } from '../../_lib/watcher';

/**
 * POST /api/payments/ingest/heartbeat  { kind?: 'sms' | 'email', appVersion? }
 * "Still alive" from a watcher, every run. Instant UPI is offered only while
 * some watcher was heard from within the silence window (Settings).
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const auth = authenticateWatcher(request, raw);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.reason }, { status: 401 });
  let body: any = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = {};
  }
  const kind = body.kind === 'email' ? 'email' : 'sms';
  const source = kind === 'email' ? 'email' : `sms:${auth.deviceId}`;
  try {
    await recordHeartbeat(createAdminClient(), { source, appVersion: body.appVersion ? String(body.appVersion).slice(0, 40) : null });
    return NextResponse.json({ ok: true, source });
  } catch (error: any) {
    console.error('[ingest/heartbeat] failed:', error?.message);
    return NextResponse.json({ ok: false, error: 'heartbeat failed' }, { status: 500 });
  }
}
