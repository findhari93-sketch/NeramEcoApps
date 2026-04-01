export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * POST /api/crm/leads/dismiss
 * Marks a lead as irrelevant (e.g. when their email matches a student).
 * Body: { userIds: string[], adminId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { userIds, adminId } = await request.json();

    if (!userIds?.length) {
      return NextResponse.json({ error: 'No user IDs provided' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    // Mark leads as irrelevant in their lead profiles
    const { error: lpError } = await supabase
      .from('lead_profiles')
      .update({ contacted_status: 'irrelevant' })
      .in('user_id', userIds)
      .is('deleted_at', null);

    if (lpError) throw lpError;

    // Also log admin notes for audit
    const notes = userIds.map((userId: string) => ({
      user_id: userId,
      admin_id: adminId,
      note: 'Lead dismissed — email matches an existing student or marked as not a quality lead.',
    }));

    await supabase.from('admin_user_notes').insert(notes);

    return NextResponse.json({ dismissed: userIds.length });
  } catch (error: any) {
    console.error('Dismiss leads error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to dismiss leads' },
      { status: 500 }
    );
  }
}
