export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getDirectEnrollmentLinkById, logDirectEnrollmentLinkEvent } from '@neram/database';
import { UUID_REGEX, actingAdminId } from '@/lib/fee-request';

const ALLOWED_DAYS = [7, 14, 30];

/**
 * POST /api/direct-enrollment/[id]/extend { days?: 7 | 14 | 30 }
 *
 * Pushes an active or expired link's expiry forward without changing its URL,
 * so the WhatsApp message the student already has keeps working. An expired
 * link becomes active again. Used, cancelled and submitted links are left alone.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  const { id } = await Promise.resolve(params as any);
  const body = await request.json().catch(() => ({}));
  const adminId = actingAdminId(request, body);
  if (!adminId) return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
  if (!UUID_REGEX.test(id)) return NextResponse.json({ error: 'Invalid link.' }, { status: 400 });
  const days = ALLOWED_DAYS.includes(Number(body?.days)) ? Number(body.days) : 7;

  try {
    const supabase = getSupabaseAdminClient() as any;
    const link: any = await getDirectEnrollmentLinkById(id, supabase);
    if (!link) return NextResponse.json({ error: 'That link was not found.' }, { status: 404 });
    if (!['active', 'expired'].includes(String(link.status))) {
      return NextResponse.json({ error: `This link is ${link.status}, so it cannot be extended.` }, { status: 409 });
    }

    const now = Date.now();
    const from = Math.max(now, new Date(link.expires_at).getTime() || now);
    const expiresAt = new Date(from + days * 24 * 60 * 60 * 1000).toISOString();
    const { data: updated, error } = await supabase
      .from('direct_enrollment_links')
      .update({
        expires_at: expiresAt,
        status: 'active',
        last_extended_at: new Date(now).toISOString(),
        extended_count: (Number(link.extended_count) || 0) + 1,
      })
      .eq('id', link.id)
      .in('status', ['active', 'expired'])
      .select('id, status, expires_at, extended_count')
      .maybeSingle();
    if (error) throw error;
    if (!updated) return NextResponse.json({ error: 'This link changed under you. Refresh.' }, { status: 409 });

    await logDirectEnrollmentLinkEvent(link.id, 'extended', adminId, { days, from: link.expires_at, to: expiresAt }, supabase);
    return NextResponse.json({ success: true, data: { id: updated.id, status: updated.status, expiresAt: updated.expires_at, extendedCount: updated.extended_count, days } });
  } catch (error: any) {
    console.error('[direct-enrollment/extend] failed:', error?.message);
    return NextResponse.json({ error: 'Could not extend the link. Try again.' }, { status: 500 });
  }
}
