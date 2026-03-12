// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getUserById,
  updateUser,
  getStudentProfileByUserId,
  updateStudentProfile,
  adminBulkDeleteUsers,
} from '@neram/database';

// GET /api/students/[id] - Get a single student
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdminClient();

    const user = await getUserById(id, supabase);
    if (!user) {
      return NextResponse.json(
        { error: 'Student not found' },
        { status: 404 }
      );
    }

    // Get student profile with course and batch
    const { data: profile } = await (supabase as any)
      .from('student_profiles' as any)
      .select(`
        *,
        courses:course_id (id, name, course_type, duration_months, total_lessons),
        batches:batch_id (id, name, start_date, end_date, schedule)
      `)
      .eq('user_id', id)
      .single();

    // Get payment history
    const { data: payments } = await (supabase as any)
      .from('payments' as any)
      .select('*')
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .limit(10);

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      status: user.status,
      avatarUrl: user.avatar_url,
      preferredLanguage: user.preferred_language,
      lastLoginAt: user.last_login_at,
      profile: profile ? {
        enrollmentDate: profile.enrollment_date,
        course: profile.courses,
        batch: profile.batches,
        msTeamsId: profile.ms_teams_id,
        msTeamsEmail: profile.ms_teams_email,
        paymentStatus: profile.payment_status,
        totalFee: profile.total_fee,
        feePaid: profile.fee_paid,
        feeDue: profile.fee_due,
        nextPaymentDate: profile.next_payment_date,
        lessonsCompleted: profile.lessons_completed,
        assignmentsCompleted: profile.assignments_completed,
        totalWatchTime: profile.total_watch_time,
        lastActivityAt: profile.last_activity_at,
        parentContact: profile.parent_contact,
        emergencyContact: profile.emergency_contact,
        notes: profile.notes,
      } : null,
      payments: payments || [],
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    });
  } catch (error) {
    console.error('Error fetching student:', error);
    return NextResponse.json(
      { error: 'Failed to fetch student' },
      { status: 500 }
    );
  }
}

// DELETE /api/students/[id] - Delete a student (hard delete: student_profile + related data)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdminClient();

    // Skip existence checks — go straight to deletion.
    // The RPC uses SECURITY DEFINER (bypasses RLS completely).
    // PostgREST queries with service_role can be blocked by restrictive RLS,
    // but the RPC runs as postgres owner and always works.

    // Nullify FK references on direct_enrollment_links (not covered by RPC)
    const { error: linkErr } = await supabase
      .from('direct_enrollment_links')
      .update({ used_by: null, lead_profile_id: null, student_profile_id: null })
      .eq('used_by', id);
    if (linkErr) console.warn('Warning: direct_enrollment_links cleanup:', linkErr.message);

    // Clean up tables not covered by the bulk delete RPC
    const extraTables = [
      'student_onboarding_progress',
      'user_exam_attempts',
      'user_exam_profiles',
      'user_notifications',
      'score_calculations',
      'prediction_logs',
      'post_enrollment_details', // FK user_id → users(id) NO CASCADE — must clean before RPC
    ];
    for (const table of extraTables) {
      const { error: cleanErr } = await supabase.from(table).delete().eq('user_id', id);
      if (cleanErr) console.warn(`Warning: failed to clean ${table}:`, cleanErr.message);
    }

    // Use atomic RPC to delete user and all related data (SECURITY DEFINER — bypasses RLS)
    const result = await adminBulkDeleteUsers([id], id, supabase);

    if (result.deletedUsers === 0) {
      // User was already deleted or never existed — still return success
      // since the intent was to remove the student
      return NextResponse.json({
        success: true,
        message: 'Student records cleaned up',
        deleted: result,
      });
    }

    return NextResponse.json({ success: true, deleted: result });
  } catch (error: any) {
    console.error('Error deleting student:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete student' },
      { status: 500 }
    );
  }
}

// PATCH /api/students/[id] - Update a student
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const supabase = getSupabaseAdminClient();

    const user = await getUserById(id, supabase);
    if (!user) {
      return NextResponse.json(
        { error: 'Student not found' },
        { status: 404 }
      );
    }

    // Update user fields
    const userUpdates: Record<string, unknown> = {};
    if (body.name !== undefined) userUpdates.name = body.name;
    if (body.email !== undefined) userUpdates.email = body.email;
    if (body.phone !== undefined) userUpdates.phone = body.phone;
    if (body.status !== undefined) userUpdates.status = body.status;

    if (Object.keys(userUpdates).length > 0) {
      await updateUser(id, userUpdates as any, supabase);
    }

    // Update student profile fields
    const profile = await getStudentProfileByUserId(id, supabase);
    if (profile) {
      const profileUpdates: Record<string, unknown> = {};
      if (body.batchId !== undefined) profileUpdates.batch_id = body.batchId || null;
      if (body.courseId !== undefined) profileUpdates.course_id = body.courseId;
      if (body.msTeamsId !== undefined) profileUpdates.ms_teams_id = body.msTeamsId;
      if (body.msTeamsEmail !== undefined) profileUpdates.ms_teams_email = body.msTeamsEmail;
      if (body.paymentStatus !== undefined) profileUpdates.payment_status = body.paymentStatus;
      if (body.totalFee !== undefined) profileUpdates.total_fee = body.totalFee;
      if (body.feePaid !== undefined) profileUpdates.fee_paid = body.feePaid;
      if (body.feeDue !== undefined) profileUpdates.fee_due = body.feeDue;
      if (body.nextPaymentDate !== undefined) profileUpdates.next_payment_date = body.nextPaymentDate;
      if (body.parentContact !== undefined) profileUpdates.parent_contact = body.parentContact;
      if (body.emergencyContact !== undefined) profileUpdates.emergency_contact = body.emergencyContact;
      if (body.notes !== undefined) profileUpdates.notes = body.notes;

      // Handle batch enrollment count changes
      if (body.batchId !== undefined) {
        const oldBatchId = profile.batch_id;
        const newBatchId = body.batchId || null;

        if (oldBatchId !== newBatchId) {
          // Decrement old batch count
          if (oldBatchId) {
            const { data: oldBatch } = await supabase.from('batches').select('enrolled_count').eq('id', oldBatchId).single();
            if (oldBatch) {
              await supabase.from('batches').update({ enrolled_count: Math.max(0, oldBatch.enrolled_count - 1) }).eq('id', oldBatchId);
            }
          }
          // Increment new batch count
          if (newBatchId) {
            const { data: newBatch } = await supabase.from('batches').select('enrolled_count').eq('id', newBatchId).single();
            if (newBatch) {
              await supabase.from('batches').update({ enrolled_count: newBatch.enrolled_count + 1 }).eq('id', newBatchId);
            }
          }
        }
      }

      if (Object.keys(profileUpdates).length > 0) {
        await updateStudentProfile(profile.id, profileUpdates as any, supabase);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating student:', error);
    return NextResponse.json(
      { error: 'Failed to update student' },
      { status: 500 }
    );
  }
}