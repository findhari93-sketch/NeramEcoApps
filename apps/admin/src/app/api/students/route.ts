// @ts-nocheck
export const dynamic = 'force-dynamic';

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
        batches:batch_id (id, name),
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
            discount_amount,
            source
          )
        )
      `,
        { count: 'exact' }
      )
      .order('enrollment_date', { ascending: false });

    // Search filter: PostgREST doesn't support .or() on foreign table columns.
    // If searching, first find matching user IDs, then filter student_profiles.
    if (search) {
      const { data: matchingUsers } = await supabase
        .from('users')
        .select('id')
        .or(
          `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`
        );
      const matchingIds = (matchingUsers || []).map((u: any) => u.id);
      if (matchingIds.length === 0) {
        // No users match — return empty result early
        const { data: allProfiles } = await supabase
          .from('student_profiles')
          .select('payment_status, fee_paid, total_fee, fee_due');
        return NextResponse.json({
          students: [],
          total: 0,
          stats: {
            totalStudents: allProfiles?.length || 0,
            fullyPaid: allProfiles?.filter((p: any) => p.payment_status === 'paid').length || 0,
            partialPayment: allProfiles?.filter((p: any) => p.payment_status === 'pending' && (p.fee_paid || 0) > 0).length || 0,
            totalRevenue: allProfiles?.reduce((sum: number, p: any) => sum + (p.fee_paid || 0), 0) || 0,
          },
        });
      }
      query = query.in('user_id', matchingIds);
    }

    // Apply payment status filter
    if (paymentStatus) {
      query = query.eq('payment_status', paymentStatus);
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data: students, error, count } = await query;

    console.log('[Students API] Query result:', { count, studentsLength: students?.length, error: error?.message });

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
        batch_name: sp.batches?.name || null,
        payment_status: sp.payment_status,
        total_fee: sp.total_fee || 0,
        fee_paid: sp.fee_paid || 0,
        fee_due: sp.fee_due || 0,
        interest_course: lead?.interest_course || null,
        application_number: lead?.application_number || null,
        final_fee: lead?.final_fee || null,
        full_payment_discount: lead?.full_payment_discount || null,
        discount_amount: lead?.discount_amount || null,
        source: lead?.source || null,
      };
    });

    // Apply course filter in application code (lead_profiles is nested through users)
    const filteredStudents = course
      ? flatStudents.filter((s: any) => s.interest_course === course)
      : flatStudents;

    // Fetch stats separately for accuracy (not affected by pagination)
    let stats = {
      totalStudents: 0,
      fullyPaid: 0,
      partialPayment: 0,
      totalRevenue: 0,
    };

    try {
      const { data: allProfiles, error: statsError } = await supabase
        .from('student_profiles')
        .select('payment_status, fee_paid, total_fee, fee_due');

      if (statsError) {
        console.error('Stats query error:', statsError.message, statsError.details);
      }

      if (allProfiles && allProfiles.length > 0) {
        stats = {
          totalStudents: allProfiles.length,
          fullyPaid: allProfiles.filter((p: any) => p.payment_status === 'paid').length,
          partialPayment: allProfiles.filter(
            (p: any) => p.payment_status === 'pending' && (p.fee_paid || 0) > 0
          ).length,
          totalRevenue: allProfiles.reduce((sum: number, p: any) => sum + (p.fee_paid || 0), 0),
        };
      } else if (!statsError) {
        // Stats query succeeded but returned empty — compute from main query results
        const allStudents = flatStudents;
        stats = {
          totalStudents: count || allStudents.length,
          fullyPaid: allStudents.filter((s: any) => s.payment_status === 'paid').length,
          partialPayment: allStudents.filter(
            (s: any) => s.payment_status === 'pending' && (s.fee_paid || 0) > 0
          ).length,
          totalRevenue: allStudents.reduce((sum: number, s: any) => sum + (s.fee_paid || 0), 0),
        };
      }
    } catch (e: any) {
      console.error('Stats computation error:', e.message);
      // Fallback: compute from the main query results
      stats = {
        totalStudents: count || flatStudents.length,
        fullyPaid: flatStudents.filter((s: any) => s.payment_status === 'paid').length,
        partialPayment: flatStudents.filter(
          (s: any) => s.payment_status === 'pending' && (s.fee_paid || 0) > 0
        ).length,
        totalRevenue: flatStudents.reduce((sum: number, s: any) => sum + (s.fee_paid || 0), 0),
      };
    }

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