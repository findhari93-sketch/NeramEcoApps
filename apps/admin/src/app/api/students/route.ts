// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

// GET /api/students - List enrolled students with stats
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const course = searchParams.get('course') || '';
    const paymentStatus = searchParams.get('paymentStatus') || '';
    const limit = parseInt(searchParams.get('limit') || '25', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const supabase = getSupabaseAdminClient();

    // Build the main query for student_profiles joined with users (and lead_profiles through users)
    let query = supabase
      .from('student_profiles')
      .select(
        `
        id,
        user_id,
        enrollment_date,
        batch_id,
        payment_status,
        total_fee,
        fee_paid,
        fee_due,
        users!inner (
          id,
          first_name,
          last_name,
          email,
          phone,
          avatar_url,
          lead_profiles!lead_profiles_user_id_fkey (
            interest_course,
            application_number,
            final_fee,
            full_payment_discount,
            discount_amount
          )
        )
      `,
        { count: 'exact' }
      )
      .order('enrollment_date', { ascending: false });

    // Apply search filter (name, email, phone)
    if (search) {
      // Search across user fields using the related users table
      query = query.or(
        `users.first_name.ilike.%${search}%,users.last_name.ilike.%${search}%,users.email.ilike.%${search}%,users.phone.ilike.%${search}%`
      );
    }

    // Apply payment status filter
    if (paymentStatus) {
      query = query.eq('payment_status', paymentStatus);
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data: students, error, count } = await query;

    if (error) {
      console.error('Students query error:', error);
      throw new Error(error.message);
    }

    // Flatten the joined data for easier frontend consumption
    const flatStudents = (students || []).map((sp: any) => {
      const user = sp.users;
      // lead_profiles is nested inside users (joined through users.id)
      const leadProfiles = user?.lead_profiles;
      const lead = Array.isArray(leadProfiles)
        ? leadProfiles[0]
        : leadProfiles;

      return {
        id: sp.id,
        user_id: sp.user_id || user?.id,
        first_name: user?.first_name || '',
        last_name: user?.last_name || '',
        email: user?.email || '',
        phone: user?.phone || '',
        avatar_url: user?.avatar_url || null,
        enrollment_date: sp.enrollment_date,
        batch_id: sp.batch_id,
        payment_status: sp.payment_status,
        total_fee: sp.total_fee || 0,
        fee_paid: sp.fee_paid || 0,
        fee_due: sp.fee_due || 0,
        interest_course: lead?.interest_course || null,
        application_number: lead?.application_number || null,
        final_fee: lead?.final_fee || null,
        full_payment_discount: lead?.full_payment_discount || null,
        discount_amount: lead?.discount_amount || null,
      };
    });

    // Apply course filter in application code (lead_profiles is nested through users)
    const filteredStudents = course
      ? flatStudents.filter((s: any) => s.interest_course === course)
      : flatStudents;

    // Fetch stats separately for accuracy (not affected by pagination)
    const { data: allProfiles, error: statsError } = await supabase
      .from('student_profiles')
      .select('payment_status, fee_paid, total_fee, fee_due');

    if (statsError) {
      console.error('Stats query error:', statsError);
    }

    const stats = {
      totalStudents: allProfiles?.length || 0,
      fullyPaid: allProfiles?.filter((p: any) => p.payment_status === 'paid').length || 0,
      partialPayment:
        allProfiles?.filter(
          (p: any) => p.payment_status === 'pending' && (p.fee_paid || 0) > 0
        ).length || 0,
      totalRevenue:
        allProfiles?.reduce((sum: number, p: any) => sum + (p.fee_paid || 0), 0) || 0,
    };

    return NextResponse.json({
      students: filteredStudents,
      total: course ? filteredStudents.length : (count || 0),
      stats,
    });
  } catch (error: any) {
    console.error('Error fetching students:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch students' },
      { status: 500 }
    );
  }
}
