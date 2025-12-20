// @ts-nocheck - Supabase types not generated
import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getUserById,
  updateUser,
  getStudentProfileByUserId,
  updateStudentProfile,
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
      .from('student_profiles')
      .select(`
        *,
        courses:course_id (id, name, course_type, duration_months, total_lessons),
        batches:batch_id (id, name, start_date, end_date, schedule)
      `)
      .eq('user_id', id)
      .single();

    // Get payment history
    const { data: payments } = await (supabase as any)
      .from('payments')
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
      if (body.batchId !== undefined) profileUpdates.batch_id = body.batchId;
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
