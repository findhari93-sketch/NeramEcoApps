// @ts-nocheck - Supabase types not generated
import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getUserById,
  updateUser,
  getLeadProfileByUserId,
  updateLeadProfile,
} from '@neram/database';

// POST /api/leads/[id]/reject - Reject a lead
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { adminId, reason, notes } = body;

    const supabase = getSupabaseAdminClient();

    // Get the lead
    const user = await getUserById(id, supabase);
    if (!user) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      );
    }

    if (user.user_type !== 'lead') {
      return NextResponse.json(
        { error: 'User is not a lead' },
        { status: 400 }
      );
    }

    // Get lead profile
    const leadProfile = await getLeadProfileByUserId(id, supabase);
    if (!leadProfile) {
      return NextResponse.json(
        { error: 'Lead profile not found' },
        { status: 404 }
      );
    }

    // Update lead profile with rejection info
    await updateLeadProfile(leadProfile.id, {
      reviewed_by: adminId || null,
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason || 'Application rejected',
      admin_notes: notes || null,
    } as any, supabase);

    // Update user status to rejected
    await updateUser(id, {
      status: 'rejected',
    } as any, supabase);

    return NextResponse.json({
      success: true,
      message: 'Lead rejected',
    });
  } catch (error) {
    console.error('Error rejecting lead:', error);
    return NextResponse.json(
      { error: 'Failed to reject lead' },
      { status: 500 }
    );
  }
}
