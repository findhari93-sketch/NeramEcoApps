export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getWhatsAppHealth, getWhatsAppSendBlock, DEMO_WA_TEMPLATES } from '@neram/database';
import { blockReasons } from '@/lib/whatsapp-block';
import { UPSTREAM_FAILED } from '@/lib/upstream-status';

/**
 * GET /api/whatsapp/health
 *
 * What Meta says about our WhatsApp Cloud API sender: the number, whether the
 * token works, quality, and which demo templates are approved. Read-only;
 * staff only (middleware). Also returns the demo template texts so staff can
 * copy them into WhatsApp Manager.
 */
export async function GET() {
  try {
    const [health, block] = await Promise.all([getWhatsAppHealth(), getWhatsAppSendBlock()]);
    // The phone can be CONNECTED while Meta blocks the whole account (for
    // example WABA #141008), so the phone status alone looks green.
    if (block && !health.diagnosis) {
      health.diagnosis = `Meta is blocking every send from this account: ${blockReasons(block)} Queued messages are held until Meta lifts this. Check WhatsApp Manager for a payment method alert and the display name review, or contact WhatsApp support.`;
    }
    return NextResponse.json({ health, templates: DEMO_WA_TEMPLATES });
  } catch (error) {
    console.error('whatsapp health failed:', error);
    return NextResponse.json({ error: 'Could not reach Meta' }, { status: UPSTREAM_FAILED });
  }
}
