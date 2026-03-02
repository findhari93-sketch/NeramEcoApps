import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { getDirectEnrollmentLinkByToken, expireOldDirectEnrollmentLinks } from '@neram/database/queries';

// GET /api/enroll/validate?token=XXX - Validate a direct enrollment token (public, no auth)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Auto-expire old links
    await expireOldDirectEnrollmentLinks(supabase);

    const link = await getDirectEnrollmentLinkByToken(token, supabase);

    if (!link) {
      return NextResponse.json(
        { error: 'Invalid enrollment link', code: 'INVALID_TOKEN' },
        { status: 404 }
      );
    }

    if (link.status === 'used') {
      return NextResponse.json(
        { error: 'This enrollment link has already been used', code: 'ALREADY_USED' },
        { status: 410 }
      );
    }

    if (link.status === 'expired' || new Date(link.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'This enrollment link has expired. Please contact your admin.', code: 'EXPIRED' },
        { status: 410 }
      );
    }

    if (link.status === 'cancelled') {
      return NextResponse.json(
        { error: 'This enrollment link has been cancelled', code: 'CANCELLED' },
        { status: 410 }
      );
    }

    // Fetch course and batch names for display
    let courseName = null;
    let batchName = null;
    let centerName = null;

    if (link.course_id) {
      const { data: course } = await (supabase
        .from('courses') as any)
        .select('name, slug')
        .eq('id', link.course_id)
        .single();
      courseName = course?.name || null;
    }

    if (link.batch_id) {
      const { data: batch } = await (supabase
        .from('batches') as any)
        .select('name')
        .eq('id', link.batch_id)
        .single();
      batchName = batch?.name || null;
    }

    if (link.center_id) {
      const { data: center } = await (supabase
        .from('offline_centers') as any)
        .select('name')
        .eq('id', link.center_id)
        .single();
      centerName = center?.name || null;
    }

    return NextResponse.json({
      success: true,
      data: {
        token: link.token,
        studentName: link.student_name,
        studentPhone: link.student_phone,
        interestCourse: link.interest_course,
        learningMode: link.learning_mode,
        courseId: link.course_id,
        batchId: link.batch_id,
        centerId: link.center_id,
        courseName,
        batchName,
        centerName,
        totalFee: link.total_fee,
        discountAmount: link.discount_amount,
        finalFee: link.final_fee,
        amountPaid: link.amount_paid,
        expiresAt: link.expires_at,
      },
    });
  } catch (error) {
    console.error('Error validating enrollment token:', error);
    return NextResponse.json(
      { error: 'Failed to validate enrollment token' },
      { status: 500 }
    );
  }
}
