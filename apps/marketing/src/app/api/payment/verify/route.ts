// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { verifyFirebaseToken } from '../../_lib/auth';
import { isValidRazorpaySignature, claimPendingPayment } from '@/lib/payments/razorpay-verify';

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyFirebaseToken(request);

    const supabase = createAdminClient();

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      paymentId,
      publicPayment,
    } = await request.json();

    // For non-public payments, auth is required
    if (!publicPayment && !auth) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'You must be logged in' },
        { status: 401 }
      );
    }

    if (!isValidRazorpaySignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
      secret: process.env.RAZORPAY_KEY_SECRET,
    }) || typeof paymentId !== 'string' || !paymentId) {
      return NextResponse.json(
        { error: 'Verification Failed', message: 'Invalid payment signature' },
        { status: 400 }
      );
    }

    // Only the pending row created for this Razorpay order can become paid.
    const claim = await claimPendingPayment(supabase, {
      paymentId,
      orderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      signature: razorpay_signature,
      userId: auth?.userId,
    });

    if (claim.kind === 'error') {
      console.error('Payment update error:', claim.error);
      return NextResponse.json(
        { error: 'Database Error', message: 'Failed to update payment' },
        { status: 500 }
      );
    }

    if (claim.kind === 'not_found') {
      return NextResponse.json(
        { error: 'Verification Failed', message: 'Payment does not match this order' },
        { status: 400 }
      );
    }

    if (claim.kind === 'already_paid') {
      // A retried verify for an order that already succeeded: answer with the
      // receipt, and do not rerun enrolment, installments or notifications.
      const paid = claim.payment;
      return NextResponse.json({
        success: true,
        message: 'Payment already verified',
        enrolled: paid.payment_scheme === 'full' ||
          (paid.payment_scheme === 'installment' && paid.installment_number === 2),
        receipt: {
          receiptNumber: paid.receipt_number || null,
          amount: paid.amount,
          razorpayPaymentId: razorpay_payment_id,
          paidAt: paid.paid_at,
          paymentScheme: paid.payment_scheme,
        },
        nextInstallmentDue: null,
      });
    }

    const payment = claim.payment;

    // Enrich payment with Razorpay details (non-blocking)
    try {
      const Razorpay = (await import('razorpay')).default;
      const rzp = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID!,
        key_secret: process.env.RAZORPAY_KEY_SECRET!,
      });
      const rzpPayment = await rzp.payments.fetch(razorpay_payment_id);

      const enrichment: Record<string, any> = {
        razorpay_method: rzpPayment.method || null,
        razorpay_bank: rzpPayment.bank || null,
        razorpay_vpa: rzpPayment.vpa || null,
        razorpay_card_last4: rzpPayment.card?.last4 || null,
        razorpay_card_network: rzpPayment.card?.network || null,
        razorpay_fee: rzpPayment.fee ? Number(rzpPayment.fee) / 100 : null, // paise → rupees
        razorpay_tax: rzpPayment.tax ? Number(rzpPayment.tax) / 100 : null, // paise → rupees
      };

      await supabase
        .from('payments' as any)
        .update(enrichment)
        .eq('id', paymentId)
        .eq('razorpay_order_id', razorpay_order_id);
    } catch (enrichError) {
      console.error('Razorpay enrichment failed (non-blocking):', enrichError);
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

      const { error: installmentError } = await supabase
        .from('payment_installments' as any)
        .insert({
          lead_profile_id: leadProfile.id,
          installment_number: 2,
          amount: secondInstallmentAmount,
          due_date: dueDate.toISOString().split('T')[0],
          reminder_date: new Date(dueDate.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          status: 'pending',
        });
      if (installmentError) {
        console.error('Failed to create second installment record:', installmentError);
      }
    }

    // Create or update student profile on full payment OR first installment
    const shouldCreateStudentProfile = isFullPayment ||
      (payment.payment_scheme === 'installment' && payment.installment_number === 1);

    if (shouldCreateStudentProfile) {
      const studentUserId = auth?.userId || payment.lead_profiles?.user_id;
      const finalFee = leadProfile.final_fee || 0;

      const { data: existingStudent, error: studentLookupError } = await supabase
        .from('student_profiles' as any)
        .select('id, fee_paid')
        .eq('user_id', studentUserId)
        .maybeSingle();

      if (studentLookupError) {
        console.error('Student profile lookup failed:', studentLookupError);
      } else if (!existingStudent) {
        const { error: studentInsertError } = await supabase
          .from('student_profiles' as any)
          .insert({
            user_id: studentUserId,
            course_id: leadProfile.selected_course_id || null,
            total_fee: finalFee,
            fee_paid: payment.amount,
            fee_due: isFullPayment ? 0 : Math.max(0, finalFee - payment.amount),
            payment_status: isFullPayment ? 'paid' : 'pending',
            enrollment_date: new Date().toISOString().split('T')[0],
          });
        if (studentInsertError) {
          console.error('Student profile insert failed:', studentInsertError);
        }
      } else if (payment.payment_scheme === 'installment') {
        // Student profile exists — update fee_paid and fee_due
        const newFeePaid = Number(existingStudent.fee_paid || 0) + Number(payment.amount);
        const { error: studentUpdateError } = await supabase
          .from('student_profiles' as any)
          .update({
            fee_paid: newFeePaid,
            fee_due: Math.max(0, finalFee - newFeePaid),
            payment_status: newFeePaid >= finalFee ? 'paid' : 'pending',
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingStudent.id);
        if (studentUpdateError) {
          console.error('Student profile fee update failed:', studentUpdateError);
        }
      }
    }

    // Re-fetch payment to get DB-trigger-generated receipt_number
    const { data: updatedPayment } = await supabase
      .from('payments' as any)
      .select('receipt_number')
      .eq('id', paymentId)
      .single();

    const receiptNumber = updatedPayment?.receipt_number || null;

    // Resolve user details with fallbacks for public payments
    const effectiveUserId = auth?.userId || payment.lead_profiles?.user_id;
    const userName = auth?.name || payment.payer_name || 'Student';
    const userEmail = auth?.email || '';
    const userPhone = auth?.phone || '';

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
        userId: effectiveUserId,
        userName,
        amount: payment.amount,
        method: 'razorpay',
        paymentId: razorpay_payment_id,
        phone: userPhone,
        receiptNumber: receiptNumber || '',
        courseName,
      });

      // 2. Student confirmation email with receipt
      if (userEmail) {
        await sendTemplateEmail(userEmail, 'payment-confirmation', {
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
        studentEmail: userEmail,
        studentPhone: userPhone,
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