export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getWhatsAppHealth, DEMO_WA_TEMPLATES } from '@neram/database';

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
    const health = await getWhatsAppHealth();
    return NextResponse.json({ health, templates: DEMO_WA_TEMPLATES });
  } catch (error) {
    console.error('whatsapp health failed:', error);
    return NextResponse.json({ error: 'Could not reach Meta' }, { status: 502 });
  }
}
