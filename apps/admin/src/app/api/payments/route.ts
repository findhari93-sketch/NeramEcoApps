// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import type { PaymentStatus } from '@neram/database';

// GET /api/payments - List all payments with stats
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as PaymentStatus | null;
    const paymentMethod = searchParams.get('paymentMethod') || undefined;
    const search = searchParams.get('search') || undefined;
    const limit = parseInt(searchParams.get('limit') || '25', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const orderBy = searchParams.get('orderBy') || 'created_at';
    const orderDirection = (searchParams.get('orderDirection') as 'asc' | 'desc') || 'desc';

    const supabase = getSupabaseAdminClient();

    // Build payments query with user join
    let query = supabase
      .from('payments')
      .select(
        `
        *,
        user:users!payments_user_id_fkey(id, first_name, last_name, name, email, phone),
        lead_profile:lead_profiles(id, interest_course, application_number)
      `,
        { count: 'exact' }
      );

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }

    if (paymentMethod) {
      query = query.eq('payment_method', paymentMethod);
    }

    // Text search on receipt_number, razorpay_payment_id, razorpay_order_id
    if (search) {
      query = query.or(
        `receipt_number.ilike.%${search}%,razorpay_payment_id.ilike.%${search}%,razorpay_order_id.ilike.%${search}%`
      );
    }

    // Order and paginate
    query = query
      .order(orderBy, { ascending: orderDirection === 'asc' })
      .range(offset, offset + limit - 1);

    const { data: payments, error: paymentsError, count } = await query;

    if (paymentsError) {
      console.error('Payments query error:', paymentsError);
      // Fallback: query without FK join if the join fails
      return await fallbackQuery(supabase, {
        status: status || undefined,
        paymentMethod,
        search,
        limit,
        offset,
        orderBy,
        orderDirection,
      });
    }

    // If search term was provided but didn't match payment fields, also search by user name/email/phone
    let allPayments = payments || [];
    if (search && allPayments.length === 0) {
      // Try searching by user details
      const { data: userPayments, error: userSearchError, count: userCount } = await supabase
        .from('users')
        .select('id')
        .or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);

      if (!userSearchError && userPayments && userPayments.length > 0) {
        const userIds = userPayments.map((u: any) => u.id);
        let retryQuery = supabase
          .from('payments')
          .select(
            `
            *,
            user:users!payments_user_id_fkey(id, first_name, last_name, name, email, phone),
            lead_profile:lead_profiles(id, interest_course, application_number)
          `,
            { count: 'exact' }
          )
          .in('user_id', userIds);

        if (status) retryQuery = retryQuery.eq('status', status);
        if (paymentMethod) retryQuery = retryQuery.eq('payment_method', paymentMethod);

        retryQuery = retryQuery
          .order(orderBy, { ascending: orderDirection === 'asc' })
          .range(offset, offset + limit - 1);

        const { data: retryData, count: retryCount } = await retryQuery;
        if (retryData) {
          allPayments = retryData;
          // Use the retry count for total
          return buildResponse(allPayments, retryCount || 0, supabase);
        }
      }
    }

    return buildResponse(allPayments, count || 0, supabase);
  } catch (error: any) {
    console.error('Error fetching payments:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch payments' },
      { status: 500 }
    );
  }
}

async function buildResponse(payments: any[], total: number, supabase: any) {
  // Calculate stats from ALL payments (not just current page)
  const stats = await calculateStats(supabase);

  // Format payments for response
  const formattedPayments = payments.map((p: any) => {
    const user = p.user;
    const leadProfile = p.lead_profile;

    return {
      id: p.id,
      user_id: p.user_id,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      payment_method: p.payment_method,
      razorpay_order_id: p.razorpay_order_id,
      razorpay_payment_id: p.razorpay_payment_id,
      razorpay_method: p.razorpay_method,
      razorpay_bank: p.razorpay_bank,
      razorpay_vpa: p.razorpay_vpa,
      razorpay_card_last4: p.razorpay_card_last4,
      razorpay_card_network: p.razorpay_card_network,
      razorpay_fee: p.razorpay_fee,
      razorpay_tax: p.razorpay_tax,
      receipt_number: p.receipt_number,
      receipt_url: p.receipt_url,
      description: p.description,
      installment_number: p.installment_number,
      screenshot_url: p.screenshot_url,
      screenshot_verified: p.screenshot_verified,
      failure_code: p.failure_code,
      failure_reason: p.failure_reason,
      paid_at: p.paid_at,
      created_at: p.created_at,
      updated_at: p.updated_at,
      // User info
      student_name: user
        ? [user.first_name, user.last_name].filter(Boolean).join(' ') || user.name || 'Unknown'
        : 'Unknown',
      student_email: user?.email || null,
      student_phone: user?.phone || null,
      // Lead profile info
      interest_course: leadProfile?.interest_course || null,
      application_number: leadProfile?.application_number || null,
    };
  });

  return NextResponse.json({
    payments: formattedPayments,
    total,
    stats,
  });
}

async function calculateStats(supabase: any) {
  // Get all payments for stats calculation
  const { data: allPayments, error: statsError } = await supabase
    .from('payments')
    .select('amount, status, paid_at');

  if (statsError) {
    console.error('Stats calculation error:', statsError);
    return {
      totalRevenue: 0,
      pendingAmount: 0,
      todayCollections: 0,
      failedCount: 0,
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  let totalRevenue = 0;
  let pendingAmount = 0;
  let todayCollections = 0;
  let failedCount = 0;

  for (const p of allPayments || []) {
    if (p.status === 'paid') {
      totalRevenue += p.amount || 0;
      // Check if paid today
      if (p.paid_at && p.paid_at >= todayISO) {
        todayCollections += p.amount || 0;
      }
    } else if (p.status === 'pending') {
      pendingAmount += p.amount || 0;
    } else if (p.status === 'failed') {
      failedCount++;
    }
  }

  return {
    totalRevenue,
    pendingAmount,
    todayCollections,
    failedCount,
  };
}

async function fallbackQuery(
  supabase: any,
  opts: {
    status?: string;
    paymentMethod?: string;
    search?: string;
    limit: number;
    offset: number;
    orderBy: string;
    orderDirection: string;
  }
) {
  // Fallback: query payments without FK join, then fetch users separately
  let query = supabase
    .from('payments')
    .select('*', { count: 'exact' });

  if (opts.status) query = query.eq('status', opts.status);
  if (opts.paymentMethod) query = query.eq('payment_method', opts.paymentMethod);
  if (opts.search) {
    query = query.or(
      `receipt_number.ilike.%${opts.search}%,razorpay_payment_id.ilike.%${opts.search}%,razorpay_order_id.ilike.%${opts.search}%`
    );
  }

  query = query
    .order(opts.orderBy, { ascending: opts.orderDirection === 'asc' })
    .range(opts.offset, opts.offset + opts.limit - 1);

  const { data: payments, error, count } = await query;

  if (error) {
    console.error('Fallback payments query error:', error);
    return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 });
  }

  // Fetch user info for each payment
  const enhancedPayments = await Promise.all(
    (payments || []).map(async (p: any) => {
      const { data: user } = await supabase
        .from('users')
        .select('id, first_name, last_name, name, email, phone')
        .eq('id', p.user_id)
        .single();

      const { data: leadProfile } = await supabase
        .from('lead_profiles')
        .select('id, interest_course, application_number')
        .eq('user_id', p.user_id)
        .maybeSingle();

      return {
        ...p,
        user,
        lead_profile: leadProfile,
      };
    })
  );

  return buildResponse(enhancedPayments.map((p: any) => ({
    ...p,
    user: p.user || null,
    lead_profile: p.lead_profile || null,
  })), count || 0, supabase);
}