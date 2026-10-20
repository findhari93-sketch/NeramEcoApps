export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { ingestAlert, recordHeartbeat, getPaymentWatchers, getPaymentMethods, kickPaymentOutbox } from '@neram/database/payments';
import { authenticateWatcher, fallbackEventId } from '../../_lib/watcher';
import { inboxEventId } from '@neram/database/payments';

/**
 * POST /api/payments/ingest/sms
 *
 * The office phone forwards bank SMS and Google Pay notifications here.
 * Body: { sender, text, receivedAt?, messageId?, source?: 'sms' | 'notification' }
 * Headers: x-neram-device plus either x-neram-signature (+ x-neram-timestamp,
 * x-neram-nonce) or x-neram-token. The call lands in webhook_inbox before
 * anything is trusted; only a parsed credit for our account becomes a
 * bank_credit_event, and the matcher decides what it means. Always 200 once
 * the device is known, so the phone does not retry forever.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const auth = authenticateWatcher(request, raw);
  if (!auth.ok && auth.reason === 'unknown device') return NextResponse.json({ ok: false, error: auth.reason }, { status: 401 });

  let body: any = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return NextResponse.json({ ok: false, error: 'Body must be JSON.' }, { status: 400 });
  }
  const text = String(body.text ?? body.body ?? body.message ?? '').slice(0, 4000);
  const sender = body.sender ? String(body.sender).slice(0, 120) : body.package ? String(body.package).slice(0, 120) : null;
  if (!text) return NextResponse.json({ ok: false, error: 'text is required' }, { status: 400 });
  // A notification is named as such, or comes from an Android package (com.google.android...); a contact label like "KVB Bank Ltd." is an SMS.
  const source: 'sms' | 'notification' = body.source === 'notification' || (!!sender && /^[a-z][a-z0-9_]*(\.[a-z0-9_]+){2,}$/i.test(sender)) ? 'notification' : 'sms';
  const receivedAt = body.receivedAt && !Number.isNaN(Date.parse(body.receivedAt)) ? new Date(body.receivedAt).toISOString() : new Date().toISOString();
  const deviceId = auth.ok ? auth.deviceId : String(request.headers.get('x-neram-device') || 'unknown');
  // Only an authenticated watcher may name the event: the id dedupes, so a stranger must never pick it.
  const eventId = inboxEventId(auth, deviceId, body.messageId ? String(body.messageId) : null, fallbackEventId([sender, text, receivedAt.slice(0, 16)]));

  try {
    const supabase = createAdminClient();
    const [watchers, methods] = await Promise.all([getPaymentWatchers(supabase), getPaymentMethods(supabase)]);
    const outcome = await ingestAlert(supabase, {
      provider: 'observer_sms',
      deviceId,
      eventId,
      source,
      sender,
      text,
      receivedAt,
      signatureOk: auth.ok,
      watchers,
      policy: methods.upiAuto,
    });
    if (auth.ok) await recordHeartbeat(supabase, { source: `sms:${deviceId}`, event: outcome.inbox === 'new' && !!outcome.credit }).catch(() => undefined);
    if (outcome.match?.kind === 'matched') await kickPaymentOutbox(supabase);
    return NextResponse.json({ ok: auth.ok, inbox: outcome.inbox, credited: Boolean(outcome.credit), match: outcome.match?.kind || null, skipped: outcome.skipped || null });
  } catch (error: any) {
    console.error('[ingest/sms] failed:', error?.message);
    return NextResponse.json({ ok: false, error: 'ingest failed' }, { status: 500 });
  }
}
