export const dynamic = 'force-dynamic';

// @ts-nocheck - Supabase types not generated
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  getSupabaseAdminClient,
  createDirectEnrollmentLink,
  listDirectEnrollmentLinks,
  expireOldDirectEnrollmentLinks,
} from '@neram/database';
import type { DirectEnrollmentLinkStatus, CourseType, LearningMode } from '@neram/database';

// GET /api/direct-enrollment - List all direct enrollment links
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as DirectEnrollmentLinkStatus | null;
    const search = searchParams.get('search') || undefined;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const supabase = getSupabaseAdminClient();

    // Auto-expire old links
    await expireOldDirectEnrollmentLinks(supabase);

    const { data, total } = await listDirectEnrollmentLinks(
      {
        status: status || undefined,
        search,
        page,
        limit,
      },
      supabase
    );

    return NextResponse.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error listing direct enrollment links:', error);
    return NextResponse.json(
      { error: 'Failed to list direct enrollment links' },
      { status: 500 }
    );
  }
}

// POST /api/direct-enrollment - Create a new direct enrollment link
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      adminId,
      studentName,
      studentPhone,
      studentEmail,
      batchId,
      centerId,
      interestCourse,
      learningMode,
      totalFee,
      discountAmount,
      finalFee,
      amountPaid,
      paymentMethod,
      transactionReference,
      paymentDate,
      adminNotes,
      paymentProofUrl,
    } = body;

    if (!adminId || !studentName || !interestCourse || !amountPaid) {
      return NextResponse.json(
        { error: 'Missing required fields: adminId, studentName, interestCourse, amountPaid' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();

    // Generate URL-safe unique token
    const token = crypto.randomBytes(16).toString('base64url');

    const link = await createDirectEnrollmentLink(
      {
        token,
        created_by: adminId,
        student_name: studentName,
        student_phone: studentPhone || undefined,
        student_email: studentEmail || undefined,
        batch_id: batchId || undefined,
        center_id: centerId || undefined,
        interest_course: interestCourse as CourseType,
        learning_mode: (learningMode as LearningMode) || 'hybrid',
        total_fee: totalFee || 0,
        discount_amount: discountAmount || 0,
        final_fee: finalFee || totalFee || 0,
        amount_paid: amountPaid,
        payment_method: paymentMethod || 'bank_transfer',
        transaction_reference: transactionReference || undefined,
        payment_date: paymentDate || undefined,
        admin_notes: adminNotes || undefined,
        payment_proof_url: paymentProofUrl || undefined,
      },
      supabase
    );

    return NextResponse.json({
      success: true,
      data: link,
    });
  } catch (error: any) {
    console.error('Error creating direct enrollment link:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to create direct enrollment link' },
      { status: 500 }
    );
  }
}