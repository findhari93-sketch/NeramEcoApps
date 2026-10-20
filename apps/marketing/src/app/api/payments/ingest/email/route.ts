export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { ingestAlert, recordHeartbeat, getPaymentWatchers, getPaymentMethods, kickPaymentOutbox, inboxEventId, dkimPassFromAuthResults } from '@neram/database/payments';
import { authenticateWatcher } from '../../_lib/watcher';

/**
 * POST /api/payments/ingest/email
 *
 * The Gmail Apps Script (tools/payment-watchers/gmail-forwarder.gs) forwards
 * bank credit emails here, signed with its device secret.
 * Body: { messageId, from, subject, bodyText, internalDate, authResults }
 * authResults is Gmail's own topmost Authentication-Results header; the server
 * decides DKIM from it (never from a boolean the client computed). A mail that
 * did not pass DKIM for the bank's domain is kept in the inbox but never
 * becomes a credit. Always 200 once the device is known.
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
  const messageId = String(body.messageId || '').slice(0, 120);
  const text = String(body.bodyText ?? body.text ?? '').slice(0, 8000);
  if (!messageId || !text) return NextResponse.json({ ok: false, error: 'messageId and bodyText are required' }, { status: 400 });
  const from = body.from ? String(body.from).slice(0, 200) : null;
  const subject = body.subject ? String(body.subject).slice(0, 200) : null;
  const receivedAt = body.internalDate && !Number.isNaN(Date.parse(body.internalDate)) ? new Date(body.internalDate).toISOString() : new Date().toISOString();
  const deviceId = auth.ok ? auth.deviceId : String(request.headers.get('x-neram-device') || 'unknown');
  const eventId = inboxEventId(auth, deviceId, messageId, messageId);

  try {
    const supabase = createAdminClient();
    const [watchers, methods] = await Promise.all([getPaymentWatchers(supabase), getPaymentMethods(supabase)]);
    // DKIM is the bank's own signature on the mail; Gmail verified it and wrote the verdict in the topmost header.
    const dkimPass = dkimPassFromAuthResults(typeof body.authResults === 'string' ? body.authResults : null, watchers.emailFromDomains);
    const outcome = await ingestAlert(supabase, {
      provider: 'observer_email',
      deviceId,
      eventId,
      source: 'email',
      sender: from,
      subject,
      text,
      receivedAt,
      signatureOk: auth.ok && dkimPass,
      watchers,
      policy: methods.upiAuto,
    });
    if (auth.ok) await recordHeartbeat(supabase, { source: 'email', event: outcome.inbox === 'new' && !!outcome.credit }).catch(() => undefined);
    if (outcome.match?.kind === 'matched') await kickPaymentOutbox(supabase);
    return NextResponse.json({ ok: auth.ok, inbox: outcome.inbox, credited: Boolean(outcome.credit), match: outcome.match?.kind || null, skipped: !dkimPass && auth.ok ? 'dkim did not pass' : outcome.skipped || null });
  } catch (error: any) {
    console.error('[ingest/email] failed:', error?.message);
    return NextResponse.json({ ok: false, error: 'ingest failed' }, { status: 500 });
  }
}
