// @ts-nocheck - Supabase types not generated
import { NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getPaymentStats,
  getMonthlyRevenue,
} from '@neram/database';

// GET /api/stats - Get dashboard statistics
export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();

    // Fetch all stats in parallel
    const [
      studentsResult,
      leadsResult,
      pendingPaymentsResult,
      paymentStats,
      monthlyRevenue,
      recentLeads,
      recentPayments,
    ] = await Promise.all([
      // Total students count
      supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('user_type', 'student')
        .eq('status', 'active'),

      // Pending leads count
      supabase
        .from('lead_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'new'),

      // Pending payments count
      supabase
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),

      // Payment statistics
      getPaymentStats(supabase),

      // Monthly revenue
      getMonthlyRevenue(supabase),

      // Recent leads (last 5)
      supabase
        .from('lead_profiles')
        .select(`
          *,
          users:user_id (id, name, email, phone, created_at)
        `)
        .order('created_at', { ascending: false })
        .limit(5),

      // Recent payments (last 5)
      supabase
        .from('payments')
        .select(`
          *,
          users:user_id (id, name, email)
        `)
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    // Calculate month-over-month growth for students
    const lastMonthDate = new Date();
    lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);

    const { count: lastMonthStudents } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('user_type', 'student')
      .eq('status', 'active')
      .lt('created_at', lastMonthDate.toISOString());

    const currentStudents = studentsResult.count || 0;
    const previousStudents = lastMonthStudents || 0;
    const studentGrowth = previousStudents > 0
      ? Math.round(((currentStudents - previousStudents) / previousStudents) * 100 * 10) / 10
      : 0;

    // Format recent leads
    const formattedLeads = ((recentLeads.data || []) as any[]).map((lead) => ({
      id: lead.id,
      name: lead.users?.name || 'Unknown',
      email: lead.users?.email || '',
      phone: lead.users?.phone || '',
      source: lead.source,
      status: lead.status,
      interestedCourse: lead.interested_course,
      createdAt: lead.created_at,
    }));

    // Format recent payments
    const formattedPayments = ((recentPayments.data || []) as any[]).map((payment) => ({
      id: payment.id,
      userName: payment.users?.name || 'Unknown',
      userEmail: payment.users?.email || '',
      amount: payment.amount,
      status: payment.status,
      paymentMethod: payment.payment_method,
      receiptNumber: payment.receipt_number,
      createdAt: payment.created_at,
    }));

    return NextResponse.json({
      summary: {
        totalStudents: currentStudents,
        studentGrowth,
        pendingLeads: leadsResult.count || 0,
        pendingPayments: pendingPaymentsResult.count || 0,
        totalRevenue: paymentStats.totalRevenue,
        paidPayments: paymentStats.paid,
      },
      monthlyRevenue,
      recentLeads: formattedLeads,
      recentPayments: formattedPayments,
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard statistics' },
      { status: 500 }
    );
  }
}
