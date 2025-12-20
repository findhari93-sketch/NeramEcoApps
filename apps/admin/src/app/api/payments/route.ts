// @ts-nocheck - Supabase types not generated
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, listPayments, getPaymentStats } from '@neram/database';
import type { PaymentStatus } from '@neram/database';

// GET /api/payments - List all payments
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as PaymentStatus | null;
    const paymentMethod = searchParams.get('method') || undefined;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    const supabase = getSupabaseAdminClient();

    const { payments, count } = await listPayments({
      status: status || undefined,
      paymentMethod,
      startDate,
      endDate,
      limit,
      offset,
      orderBy: 'created_at',
      orderDirection: 'desc',
    }, supabase);

    // Enhance payments with user info
    const enhancedPayments = await Promise.all(
      payments.map(async (payment) => {
        const { data: user } = await (supabase as any)
          .from('users')
          .select('name, email, phone')
          .eq('id', payment.user_id)
          .single();

        return {
          id: payment.id,
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
          paymentMethod: payment.payment_method,
          razorpayPaymentId: payment.razorpay_payment_id,
          receiptNumber: payment.receipt_number,
          screenshotUrl: payment.screenshot_url,
          screenshotVerified: payment.screenshot_verified,
          description: payment.description,
          paidAt: payment.paid_at,
          createdAt: payment.created_at,
          user: user ? {
            id: payment.user_id,
            name: user.name,
            email: user.email,
            phone: user.phone,
          } : null,
        };
      })
    );

    return NextResponse.json({
      payments: enhancedPayments,
      total: count,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (error) {
    console.error('Error fetching payments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payments' },
      { status: 500 }
    );
  }
}
