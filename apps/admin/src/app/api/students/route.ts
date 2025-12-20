// @ts-nocheck - Supabase types not generated
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, listUsers } from '@neram/database';
import type { UserStatus, PaymentStatus } from '@neram/database';

// GET /api/students - List all students
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as UserStatus | null;
    const paymentStatus = searchParams.get('paymentStatus') as PaymentStatus | null;
    const search = searchParams.get('search') || undefined;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    const supabase = getSupabaseAdminClient();

    // Get students (users with type 'student')
    const { users, count } = await listUsers({
      userType: 'student',
      status: status || undefined,
      search,
      limit,
      offset,
      orderBy: 'created_at',
      orderDirection: 'desc',
    }, supabase);

    // Get student profiles with course and batch info
    const studentsWithProfiles = await Promise.all(
      users.map(async (user) => {
        const { data: profile } = await (supabase as any)
          .from('student_profiles')
          .select(`
            *,
            courses:course_id (name, course_type),
            batches:batch_id (name, start_date)
          `)
          .eq('user_id', user.id)
          .single();

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          status: user.status,
          enrollmentDate: profile?.enrollment_date || null,
          course: profile?.courses?.name || null,
          courseType: profile?.courses?.course_type || null,
          batch: profile?.batches?.name || null,
          batchStartDate: profile?.batches?.start_date || null,
          paymentStatus: profile?.payment_status || null,
          totalFee: profile?.total_fee || 0,
          feePaid: profile?.fee_paid || 0,
          feeDue: profile?.fee_due || 0,
          lessonsCompleted: profile?.lessons_completed || 0,
          lastActivityAt: profile?.last_activity_at || null,
          createdAt: user.created_at,
        };
      })
    );

    // Filter by payment status if specified
    let filteredStudents = studentsWithProfiles;
    if (paymentStatus) {
      filteredStudents = studentsWithProfiles.filter(s => s.paymentStatus === paymentStatus);
    }

    return NextResponse.json({
      students: filteredStudents,
      total: count,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (error) {
    console.error('Error fetching students:', error);
    return NextResponse.json(
      { error: 'Failed to fetch students' },
      { status: 500 }
    );
  }
}
