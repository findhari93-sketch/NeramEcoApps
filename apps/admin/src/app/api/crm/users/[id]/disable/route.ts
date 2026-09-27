// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getRequestAdminId } from '@/lib/request-admin';
import { getSupabaseAdminClient, recordUserHistory } from '@neram/database';

/**
 * POST /api/crm/users/[id]/disable
 * Disable a user account, preventing platform access.
 * Body: { adminId: string, reason?: string }
 *
 * DELETE /api/crm/users/[id]/disable
 * Re-enable a previously disabled user account.
 */

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { adminId: bodyAdminId, reason } = body;
    // The verified caller from middleware.ts; the body value is only a fallback
    // for ADMIN_API_AUTH_MODE=report and is never trusted when the header is set.
    const adminId = getRequestAdminId(request) ?? bodyAdminId;
    if (!adminId) {
      return NextResponse.json({ error: 'adminId is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    // Fetch current metadata to merge the disable_reason
    const { data: current } = await supabase
      .from('users')
      .select('metadata')
      .eq('id', params.id)
      .single();

    const { error } = await supabase
      .from('users')
      .update({
        is_disabled: true,
        disabled_at: new Date().toISOString(),
        disabled_by: adminId,
        metadata: {
          ...(current?.metadata || {}),
          ...(reason ? { disable_reason: reason } : {}),
        },
      })
      .eq('id', params.id);

    if (error) throw error;
    await recordUserHistory(supabase, params.id, 'is_disabled', false, { value: true, reason: reason || null }, adminId);

    return NextResponse.json({ success: true, is_disabled: true });
  } catch (error: any) {
    console.error('Disable user error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to disable user' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseAdminClient();
    const adminId = getRequestAdminId(request);

    const { error } = await supabase
      .from('users')
      .update({
        is_disabled: false,
        disabled_at: null,
        disabled_by: null,
      })
      .eq('id', params.id);

    if (error) throw error;
    if (adminId) await recordUserHistory(supabase, params.id, 'is_disabled', true, false, adminId);

    return NextResponse.json({ success: true, is_disabled: false });
  } catch (error: any) {
    console.error('Enable user error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to enable user' },
      { status: 500 }
    );
  }
}
