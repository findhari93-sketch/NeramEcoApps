export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { getDirectEnrollmentLinkByToken, expireOldDirectEnrollmentLinks } from '@neram/database/queries';
import { verifyFirebaseToken } from '../../_lib/auth';

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
      // Fetch enrollment details so the frontend can show a rich summary
      let applicationNumber = null;
      let enrolledAt = link.used_at || null;
      let enrolledByFirebaseUid = null;

      // Get the Firebase UID of the user who enrolled (for ownership check)
      if (link.used_by) {
        try {
          const { data: enrolledUser } = await (supabase
            .from('users') as any)
            .select('firebase_uid')
            .eq('id', link.used_by)
            .maybeSingle();
          enrolledByFirebaseUid = enrolledUser?.firebase_uid || null;
        } catch {
          // Ignore
        }
      }

      // Check if the requesting user is the owner (optional auth)
      let isOwner = false;
      let fullLeadProfile: Record<string, unknown> | null = null;
      const auth = await verifyFirebaseToken(request).catch((e) => {
        console.error('[Validate] Firebase token verification failed:', e?.message || e);
        return null;
      });

      console.log('[Validate] Auth result:', auth ? { userId: auth.userId } : 'null', 'enrolledByFirebaseUid:', enrolledByFirebaseUid);

      if (link.lead_profile_id) {
        try {
          // If authenticated owner, fetch full lead_profile for view/edit mode
          if (auth && enrolledByFirebaseUid) {
            // Look up the requesting user's firebase_uid
            const { data: requestingUser } = await (supabase
              .from('users') as any)
              .select('firebase_uid')
              .eq('id', auth.userId)
              .maybeSingle();

            if (requestingUser?.firebase_uid === enrolledByFirebaseUid) {
              isOwner = true;
              const { data: leadProfile } = await (supabase
                .from('lead_profiles') as any)
                .select('*')
                .eq('id', link.lead_profile_id)
                .maybeSingle();
              if (leadProfile) {
                applicationNumber = leadProfile.application_number || null;
                fullLeadProfile = leadProfile;
              }
            }
          }

          // If not owner, still fetch application_number for summary
          if (!isOwner) {
            const { data: leadProfile } = await (supabase
              .from('lead_profiles') as any)
              .select('application_number')
              .eq('id', link.lead_profile_id)
              .maybeSingle();
            applicationNumber = leadProfile?.application_number || null;
          }
        } catch {
          // Ignore lookup error
        }
      }

      // Fetch course name for display
      let courseName = null;
      if (link.course_id) {
        try {
          const { data: course } = await (supabase
            .from('courses') as any)
            .select('name')
            .eq('id', link.course_id)
            .maybeSingle();
          courseName = course?.name || null;
        } catch {
          // Ignore
        }
      }

      const responseData: Record<string, unknown> = {
        applicationNumber,
        studentName: link.student_name,
        interestCourse: link.interest_course,
        courseName,
        totalFee: link.total_fee,
        amountPaid: link.amount_paid,
        finalFee: link.final_fee,
        enrolledAt,
        enrolledByFirebaseUid,
      };

      // Include full lead_profile for authenticated owner (for view/edit mode)
      if (isOwner && fullLeadProfile) {
        responseData.leadProfile = {
          id: fullLeadProfile.id,
          firstName: fullLeadProfile.first_name || (fullLeadProfile as any).users?.first_name,
          fatherName: fullLeadProfile.father_name,
          dateOfBirth: fullLeadProfile.date_of_birth,
          gender: fullLeadProfile.gender,
          country: fullLeadProfile.country,
          state: fullLeadProfile.state,
          city: fullLeadProfile.city,
          district: fullLeadProfile.district,
          pincode: fullLeadProfile.pincode,
          address: fullLeadProfile.address,
          applicantCategory: fullLeadProfile.applicant_category,
          academicData: fullLeadProfile.academic_data,
          casteCategory: fullLeadProfile.caste_category,
          targetExamYear: fullLeadProfile.target_exam_year,
          schoolType: fullLeadProfile.school_type,
          parentPhone: fullLeadProfile.parent_phone,
          learningMode: fullLeadProfile.learning_mode,
        };
        responseData.isOwner = true;
      }

      return NextResponse.json(
        {
          error: 'This enrollment link has already been used',
          code: 'ALREADY_USED',
          data: responseData,
        },
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