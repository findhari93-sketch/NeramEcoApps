// @ts-nocheck - Supabase types not generated
import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getPaymentById,
  verifyScreenshotPayment,
  getStudentProfileByUserId,
  updateStudentProfile,
} from '@neram/database';

// POST /api/payments/[id]/verify - Verify a screenshot payment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { adminId, approved, notes } = body;

    if (typeof approved !== 'boolean') {
      return NextResponse.json(
        { error: 'approved field is required (boolean)' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();

    // Get the payment
    const payment = await getPaymentById(id, supabase);
    if (!payment) {
      return NextResponse.json(
        { error: 'Payment not found' },
        { status: 404 }
      );
    }

    if (payment.payment_method !== 'upi_screenshot') {
      return NextResponse.json(
        { error: 'This payment is not a screenshot payment' },
        { status: 400 }
      );
    }

    if (payment.screenshot_verified) {
      return NextResponse.json(
        { error: 'This payment has already been verified' },
        { status: 400 }
      );
    }

    // Verify the payment
    const updatedPayment = await verifyScreenshotPayment(
      id,
      adminId,
      approved,
      notes,
      supabase
    );

    // If approved, update student profile payment info
    if (approved && payment.user_id) {
      const studentProfile = await getStudentProfileByUserId(payment.user_id, supabase);
      if (studentProfile) {
        const newFeePaid = (studentProfile.fee_paid || 0) + payment.amount;
        const newFeeDue = Math.max(0, (studentProfile.total_fee || 0) - newFeePaid);
        const newPaymentStatus = newFeeDue <= 0 ? 'paid' : 'pending';

        await updateStudentProfile(studentProfile.id, {
          fee_paid: newFeePaid,
          fee_due: newFeeDue,
          payment_status: newPaymentStatus as any,
        } as any, supabase);
      }
    }

    return NextResponse.json({
      success: true,
      message: approved ? 'Payment verified and approved' : 'Payment rejected',
      payment: {
        id: updatedPayment.id,
        status: updatedPayment.status,
        screenshotVerified: updatedPayment.screenshot_verified,
        verifiedAt: updatedPayment.verified_at,
      },
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    return NextResponse.json(
      { error: 'Failed to verify payment' },
      { status: 500 }
    );
  }
}
