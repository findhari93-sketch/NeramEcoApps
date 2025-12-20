// @ts-nocheck - Supabase types not generated
import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getUserById,
  updateUser,
  getLeadProfileByUserId,
  updateLeadProfile,
  createStudentProfile,
  getCourseById,
  getAvailableBatches,
  incrementBatchEnrollment,
} from '@neram/database';

// POST /api/leads/[id]/approve - Approve a lead and convert to student
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { adminId, batchId, courseId, totalFee, notes } = body;

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

    // Update lead profile with review info
    await updateLeadProfile(leadProfile.id, {
      reviewed_by: adminId || null,
      reviewed_at: new Date().toISOString(),
      admin_notes: notes || null,
      assigned_fee: totalFee || null,
      final_fee: totalFee || null,
    } as any, supabase);

    // Update user to student
    await updateUser(id, {
      user_type: 'student',
      status: 'active',
    } as any, supabase);

    // Create student profile
    const studentProfile = await createStudentProfile({
      user_id: id,
      enrollment_date: new Date().toISOString().split('T')[0],
      batch_id: batchId || null,
      course_id: courseId || null,
      ms_teams_id: null,
      ms_teams_email: null,
      payment_status: 'pending',
      total_fee: totalFee || 0,
      fee_paid: 0,
      fee_due: totalFee || 0,
      next_payment_date: null,
      lessons_completed: 0,
      assignments_completed: 0,
      total_watch_time: 0,
      last_activity_at: null,
      parent_contact: null,
      emergency_contact: null,
      notes: notes || null,
    }, supabase);

    // Increment batch enrollment if batch selected
    if (batchId) {
      try {
        await incrementBatchEnrollment(batchId, supabase);
      } catch (e) {
        console.warn('Failed to increment batch enrollment:', e);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Lead approved and converted to student',
      studentProfileId: studentProfile.id,
    });
  } catch (error) {
    console.error('Error approving lead:', error);
    return NextResponse.json(
      { error: 'Failed to approve lead' },
      { status: 500 }
    );
  }
}
