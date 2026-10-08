export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { sendWhatsAppTemplate } from '@neram/database';
import { requireAdminRole } from '@/lib/marketing-ai/guard';

/**
 * POST /api/whatsapp/test  { phone }
 *
 * Sends Meta's built-in `hello_world` template (present on every WhatsApp
 * Business Account, language en_US) and returns Meta's answer verbatim, so a
 * token, number or dev-mode problem shows up as the real error. Admins only.
 */
export async function POST(request: Request) {
  const gate = requireAdminRole(request);
  if (!gate.ok) return gate.response;
  const body = (await request.json().catch(() => ({}))) as { phone?: string };
  const phone = (body.phone || '').replace(/\D/g, '').slice(-10);
  if (!/^[6-9]\d{9}$/.test(phone)) {
    return NextResponse.json({ error: 'Enter a 10-digit Indian mobile number.' }, { status: 400 });
  }
  const result = await sendWhatsAppTemplate(phone, 'hello_world', 'en_US');
  return NextResponse.json(result, { status: result.success ? 200 : 502 });
}
