// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import crypto from 'crypto';
import { verifyFirebaseToken } from '../../_lib/auth';

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyFirebaseToken(request);
    if (!auth) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'You must be logged in' },
        { status: 401 }
      );
    }

    const supabase = createAdminClient();

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      paymentId,
    } = await request.json();

    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return NextResponse.json(
        { error: 'Verification Failed', message: 'Invalid payment signature' },
        { status: 400 }
      );
    }

    // Update payment record (status must be 'paid' to trigger receipt_number generation)
    const { data: payment, error: updateError } = await supabase
      .from('payments' as any)
      .update({
        razorpay_payment_id,
        razorpay_signature,
        status: 'paid',
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentId)
      .eq('user_id', auth.userId)
      .select(`
        *,
        lead_profiles(id, interest_course, payment_scheme, final_fee, full_payment_discount, discount_amount, assigned_fee)
      `)
      .single();

    if (updateError) {
      console.error('Payment update error:', updateError);
      return NextResponse.json(
        { error: 'Database Error', message: 'Failed to update payment' },
        { status: 500 }
      );
    }

    // Update lead profile status
    const leadProfile = payment.lead_profiles;
    const isFullPayment = payment.payment_scheme === 'full' ||
      (payment.payment_scheme === 'installment' && payment.installment_number === 2);

    const { error: leadUpdateError } = await supabase
      .from('lead_profiles' as any)
      .update({
        status: isFullPayment ? 'enrolled' : 'partial_payment',
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadProfile.id);

    if (leadUpdateError) {
      console.error('Failed to update lead profile status:', leadUpdateError);
    }

    // If installment payment, create next installment record
    if (payment.payment_scheme === 'installment' && payment.installment_number === 1) {
      const secondInstallmentAmount = leadProfile.final_fee - payment.amount;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);

      await supabase
        .from('payment_installments' as any)
        .insert({
          lead_profile_id: leadProfile.id,
          installment_number: 2,
          amount: secondInstallmentAmount,
          due_date: dueDate.toISOString().split('T')[0],
          reminder_date: new Date(dueDate.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          status: 'pending',
        });
    }

    // If full payment completed, create student profile
    if (isFullPayment) {
      const { data: existingStudent } = await supabase
        .from('student_profiles' as any)
        .select('id')
        .eq('user_id', auth.userId)
        .single();

      if (!existingStudent) {
        await supabase
          .from('student_profiles' as any)
          .insert({
            user_id: auth.userId,
            payment_status: 'paid',
            enrollment_date: new Date().toISOString().split('T')[0],
          });
      }
    }

    // Re-fetch payment to get DB-trigger-generated receipt_number
    const { data: updatedPayment } = await supabase
      .from('payments' as any)
      .select('receipt_number')
      .eq('id', paymentId)
      .single();

    const receiptNumber = updatedPayment?.receipt_number || null;
    const userName = auth.name || 'Student';

    const COURSE_LABELS: Record<string, string> = {
      nata: 'NATA Preparation Course',
      jee_paper2: 'JEE Paper 2 Preparation Course',
      both: 'NATA & JEE Combined Course',
      not_sure: 'Architecture Entrance Course',
    };
    const courseName = COURSE_LABELS[leadProfile.interest_course] || 'Architecture Entrance Course';

    // Send payment confirmation notifications
    try {
      const { notifyPaymentReceived, sendTemplateEmail } = await import('@neram/database');

      // 1. Multi-channel notification (Telegram, admin bell, user bell, WhatsApp)
      await notifyPaymentReceived({
        userId: auth.userId,
        userName,
        amount: payment.amount,
        method: 'razorpay',
        paymentId: razorpay_payment_id,
        phone: auth.phone || '',
        receiptNumber: receiptNumber || '',
        courseName,
      });

      // 2. Student confirmation email with receipt
      if (auth.email) {
        await sendTemplateEmail(auth.email, 'payment-confirmation', {
          name: userName,
          course: courseName,
          amount: Number(payment.amount).toLocaleString('en-IN'),
          paymentId: razorpay_payment_id,
          receiptNumber: receiptNumber || paymentId,
          date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
          cashback: 0,
        });
      }

      // 3. Admin notification email
      await sendTemplateEmail(process.env.ADMIN_EMAIL || 'admin@neramclasses.com', 'admin-payment-received', {
        studentName: userName,
        studentEmail: auth.email || '',
        studentPhone: auth.phone || '',
        amount: Number(payment.amount).toLocaleString('en-IN'),
        razorpayId: razorpay_payment_id,
        receiptNumber: receiptNumber || paymentId,
        course: courseName,
        paymentScheme: payment.payment_scheme === 'full' ? 'Full Payment' : `Installment #${payment.installment_number || 1}`,
      });
    } catch (notifError) {
      console.error('Failed to send payment notifications:', notifError);
    }

    return NextResponse.json({
      success: true,
      message: 'Payment verified successfully',
      enrolled: isFullPayment,
      receipt: {
        receiptNumber,
        amount: payment.amount,
        razorpayPaymentId: razorpay_payment_id,
        paidAt: new Date().toISOString(),
        courseName,
        paymentScheme: payment.payment_scheme,
      },
      nextInstallmentDue: payment.payment_scheme === 'installment' && payment.installment_number === 1
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        : null,
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    return NextResponse.json(
      { error: 'Server Error', message: 'Failed to verify payment' },
      { status: 500 }
    );
  }
}