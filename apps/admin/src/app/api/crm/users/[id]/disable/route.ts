// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

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
    const { adminId, reason } = body;

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

    const { error } = await supabase
      .from('users')
      .update({
        is_disabled: false,
        disabled_at: null,
        disabled_by: null,
      })
      .eq('id', params.id);

    if (error) throw error;

    return NextResponse.json({ success: true, is_disabled: false });
  } catch (error: any) {
    console.error('Enable user error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to enable user' },
      { status: 500 }
    );
  }
}
