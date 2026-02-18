// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@neram/database';

export async function GET(
  request: NextRequest,
  { params }: { params: { leadId: string } }
) {
  try {
    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get lead profile with fee details
    const { data: leadProfile, error } = await supabase
      .from('lead_profiles' as any)
      .select('*')
      .eq('id', params.leadId)
      .eq('user_id', user.id)
      .single();

    if (error || !leadProfile) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Get existing payments
    const { data: payments } = await supabase
      .from('payments' as any)
      .select('*')
      .eq('lead_profile_id', params.leadId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    // Get pending installments
    const { data: installments } = await supabase
      .from('payment_installments' as any)
      .select('*')
      .eq('lead_profile_id', params.leadId)
      .order('installment_number', { ascending: true });

    const baseFee = leadProfile.assigned_fee || leadProfile.final_fee || 16500;
    const finalFee = leadProfile.final_fee || baseFee;
    const fullPaymentDiscount = leadProfile.full_payment_discount || 5000;
    const paymentRecommendation = leadProfile.payment_recommendation || 'full';
    const totalPaid = (payments || [])
      .filter((p: any) => p.status === 'paid' || p.status === 'completed')
      .reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

    // Course label
    const COURSE_LABELS: Record<string, string> = {
      nata: 'NATA Preparation Course',
      jee_paper2: 'JEE Paper 2 Preparation Course',
      both: 'NATA & JEE Combined Course',
      not_sure: 'Architecture Entrance Course',
    };

    return NextResponse.json({
      leadProfileId: leadProfile.id,
      courseName: COURSE_LABELS[leadProfile.interest_course] || 'Architecture Entrance Course',
      status: leadProfile.status,
      baseFee,
      finalFee,
      fullPaymentDiscount,
      fullPaymentAmount: finalFee - fullPaymentDiscount,
      installment1Amount: Math.ceil(finalFee / 2),
      installment2Amount: finalFee - Math.ceil(finalFee / 2),
      paymentRecommendation,
      paymentScheme: leadProfile.payment_scheme || 'full',
      paymentDeadline: leadProfile.payment_deadline || null,
      totalPaid,
      remainingAmount: finalFee - totalPaid,
      payments: payments || [],
      installments: installments || [],
      scholarshipDiscount: leadProfile.discount_amount || 0,
      couponCode: leadProfile.coupon_code || null,
    });
  } catch (error: any) {
    console.error('Payment details error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
