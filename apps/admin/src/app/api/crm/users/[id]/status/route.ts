// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, notifyApplicationApproved, createUserSpecificCoupon } from '@neram/database';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const {
      action,
      adminId,
      notes,
      rejectionReason,
      deletionReason,
      // Fee assignment data (for approve)
      feeStructureId,
      assignedFee,
      paymentScheme,
      discountAmount,
      finalFee,
      fullPaymentDiscount,
      paymentRecommendation,
      paymentDeadline,
      // Fee payment flow enhancements
      allowedPaymentModes,
      installment1Amount,
      installment2Amount,
      installment2DueDays,
      couponData,
    } = body;

    if (!action || !adminId) {
      return NextResponse.json(
        { error: 'action and adminId are required' },
        { status: 400 }
      );
    }

    if (!['approve', 'reject', 'delete'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be "approve", "reject", or "delete"' },
        { status: 400 }
      );
    }

    // Validate adminId is a valid UUID (Supabase user ID, not MS OID or 'unknown')
    if (!UUID_REGEX.test(adminId)) {
      return NextResponse.json(
        { error: 'adminId must be a valid UUID (Supabase user ID). Admin profile may not be resolved yet. Please wait and try again.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();

    // Find the user's most recent lead profile
    const { data: leadProfile, error: lpError } = await supabase
      .from('lead_profiles' as any)
      .select('id, user_id, status, application_number, interest_course, final_fee')
      .eq('user_id', params.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (lpError || !leadProfile) {
      return NextResponse.json(
        { error: 'No application found for this user' },
        { status: 404 }
      );
    }

    // Get user details for notifications
    const { data: userData } = await supabase
      .from('users' as any)
      .select('name, email, phone')
      .eq('id', params.id)
      .single();

    const updateData: any = {
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (action === 'approve') {
      updateData.status = 'approved';
      if (notes) updateData.admin_notes = notes;

      // Fee assignment data (with NaN guards)
      if (assignedFee !== undefined && !isNaN(Number(assignedFee)) && Number(assignedFee) > 0) {
        updateData.assigned_fee = Number(assignedFee);
      }
      if (discountAmount !== undefined && !isNaN(Number(discountAmount))) {
        updateData.discount_amount = Number(discountAmount);
      }
      if (finalFee !== undefined && !isNaN(Number(finalFee)) && Number(finalFee) > 0) {
        updateData.final_fee = Number(finalFee);
      }
      if (paymentScheme) {
        updateData.payment_scheme = paymentScheme;
      }
      // Note: feeStructureId is from fee_structures table, NOT courses table.
      // selected_course_id references courses(id) — do not set it here.
      // The fee structure selection auto-fills pricing fields only.
      if (fullPaymentDiscount !== undefined && !isNaN(Number(fullPaymentDiscount))) {
        updateData.full_payment_discount = Number(fullPaymentDiscount);
      }
      if (paymentRecommendation) {
        updateData.payment_recommendation = paymentRecommendation;
      }
      if (paymentDeadline) {
        updateData.payment_deadline = paymentDeadline;
      } else {
        // Default: 7 days from now
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + 7);
        updateData.payment_deadline = deadline.toISOString();
      }

      // Fee payment flow enhancements
      if (allowedPaymentModes) {
        updateData.allowed_payment_modes = allowedPaymentModes;
      }
      if (installment1Amount !== undefined && !isNaN(Number(installment1Amount))) {
        updateData.installment_1_amount = Number(installment1Amount);
      }
      if (installment2Amount !== undefined && !isNaN(Number(installment2Amount))) {
        updateData.installment_2_amount = Number(installment2Amount);
      }
      if (installment2DueDays !== undefined && !isNaN(Number(installment2DueDays))) {
        updateData.installment_2_due_days = Number(installment2DueDays);
      }
    } else if (action === 'reject') {
      updateData.status = 'rejected';
      updateData.rejection_reason = rejectionReason || notes || '';
      if (notes) updateData.admin_notes = notes;
    } else if (action === 'delete') {
      updateData.status = 'deleted';
      updateData.deleted_at = new Date().toISOString();
      updateData.deletion_reason = deletionReason || notes || 'Admin deleted';
      if (notes) updateData.admin_notes = notes;
    }

    const { data: updated, error: updateError } = await supabase
      .from('lead_profiles' as any)
      .update(updateData)
      .eq('id', leadProfile.id)
      .select()
      .single();

    if (updateError) {
      console.error('Lead profile update error:', { message: updateError.message, details: updateError.details, hint: updateError.hint, code: updateError.code });
      throw updateError;
    }

    // Create user-specific coupon if requested during approval
    let createdCouponCode: string | undefined;
    if (action === 'approve' && couponData && couponData.discountValue > 0) {
      try {
        const coupon = await createUserSpecificCoupon({
          leadProfileId: leadProfile.id,
          createdBy: adminId,
          discountType: couponData.discountType || 'fixed',
          discountValue: Number(couponData.discountValue),
          expiresInDays: couponData.expiresInDays || 30,
          description: couponData.description || 'Admin-generated during approval',
          courseType: leadProfile.interest_course || undefined,
        }, supabase);

        createdCouponCode = coupon.code;

        // Link coupon to lead profile
        await supabase
          .from('lead_profiles' as any)
          .update({
            admin_coupon_id: coupon.id,
            coupon_code: coupon.code,
          })
          .eq('id', leadProfile.id);
      } catch (couponError) {
        console.error('Failed to create coupon during approval:', couponError);
        // Don't fail the approval if coupon creation fails
      }
    }

    // Record in profile history (non-blocking)
    try {
      await supabase.from('user_profile_history' as any).insert({
        user_id: params.id,
        field_name: 'lead_profile.status',
        old_value: JSON.stringify(leadProfile.status),
        new_value: JSON.stringify(updateData.status),
        changed_by: adminId,
        change_source: 'admin',
      });

      // If fee was assigned, also record that
      if (action === 'approve' && finalFee) {
        await supabase.from('user_profile_history' as any).insert({
          user_id: params.id,
          field_name: 'lead_profile.final_fee',
          old_value: JSON.stringify(leadProfile.final_fee),
          new_value: JSON.stringify(finalFee),
          changed_by: adminId,
          change_source: 'admin',
        });
      }
    } catch (historyError) {
      console.error('Failed to record profile history (non-blocking):', historyError);
    }

    // If deleted, create audit record (non-blocking)
    if (action === 'delete') {
      try {
        await supabase.from('application_deletions' as any).insert({
          lead_profile_id: leadProfile.id,
          deleted_by: adminId,
          deletion_type: 'admin_deleted',
          deletion_reason: deletionReason || notes || 'Admin deleted',
          deleted_at: new Date().toISOString(),
          can_restore: true,
        });
      } catch (deleteAuditError) {
        console.error('Failed to record deletion audit (non-blocking):', deleteAuditError);
      }
    }

    // If approved, send notifications to student (Email + WhatsApp + In-App)
    if (action === 'approve' && userData) {
      const effectiveFinalFee = Number(finalFee) || Number(leadProfile.final_fee) || 16500;
      const effectiveDiscount = Number(fullPaymentDiscount) || 5000;

      const COURSE_LABELS: Record<string, string> = {
        nata: 'NATA',
        jee_paper2: 'JEE Paper 2',
        both: 'Both NATA & JEE',
        not_sure: 'Course (TBD)',
      };

      try {
        await notifyApplicationApproved({
          userId: params.id,
          userName: userData.name || 'Student',
          email: userData.email || '',
          phone: userData.phone || '',
          applicationNumber: leadProfile.application_number || '',
          course: COURSE_LABELS[leadProfile.interest_course] || leadProfile.interest_course || 'Course',
          finalFee: effectiveFinalFee,
          fullPaymentDiscount: effectiveDiscount,
          paymentRecommendation: paymentRecommendation || 'full',
          paymentDeadline: updateData.payment_deadline
            ? new Date(updateData.payment_deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
            : undefined,
          leadProfileId: leadProfile.id,
          // Enhanced data for email template
          allowedPaymentModes: allowedPaymentModes || 'full_and_installment',
          installment1Amount: installment1Amount ? Number(installment1Amount) : undefined,
          installment2Amount: installment2Amount ? Number(installment2Amount) : undefined,
          installment2DueDays: installment2DueDays ? Number(installment2DueDays) : undefined,
          couponCode: createdCouponCode,
        }, supabase);
      } catch (notifError) {
        console.error('Failed to send approval notifications:', notifError);
      }
    }

    return NextResponse.json({ success: true, leadProfile: updated });
  } catch (error: any) {
    console.error('CRM status update error:', { message: error.message, details: error.details, hint: error.hint, code: error.code });
    return NextResponse.json(
      { error: error.message || 'Failed to update status' },
      { status: 500 }
    );
  }
}