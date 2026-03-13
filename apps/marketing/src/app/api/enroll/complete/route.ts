// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminClient,
  getDirectEnrollmentLinkByToken,
  updateDirectEnrollmentLink,
  createStudentProfile,
  updateUser,
  incrementBatchEnrollment,
  notifyNewApplication,
  initializeStudentOnboarding,
} from '@neram/database';
import { verifyFirebaseToken } from '../../_lib/auth';

// POST /api/enroll/complete - Complete direct enrollment (requires Firebase auth)
export async function POST(request: NextRequest) {
  try {
    // Verify Firebase auth
    const auth = await verifyFirebaseToken(request);
    if (!auth) {
      return NextResponse.json(
        { error: 'Authentication required. Please sign in with Google.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      token,
      // Personal details
      firstName,
      fatherName,
      dateOfBirth,
      gender,
      // Location
      country,
      state,
      city,
      district,
      pincode,
      address,
      // Academic
      applicantCategory,
      academicData,
      casteCategory,
      targetExamYear,
      schoolType,
      // Phone
      parentPhone,
      phoneVerified,
      phoneVerifiedAt,
    } = body;

    if (!token) {
      return NextResponse.json(
        { error: 'Enrollment token is required' },
        { status: 400 }
      );
    }

    if (!firstName || !applicantCategory) {
      return NextResponse.json(
        { error: 'First name and applicant category are required' },
        { status: 400 }
      );
    }

    if (!phoneVerified) {
      return NextResponse.json(
        { error: 'Phone verification is required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // 1. Validate token
    const link = await getDirectEnrollmentLinkByToken(token, supabase);
    if (!link || link.status !== 'active') {
      return NextResponse.json(
        { error: 'Invalid or expired enrollment link' },
        { status: 400 }
      );
    }

    // Check if user is already a student
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('id', auth.userId)
      .single();

    if (existingUser?.user_type === 'student') {
      return NextResponse.json(
        { error: 'You are already enrolled as a student' },
        { status: 400 }
      );
    }

    // 2. Update user profile with name and type
    await updateUser(auth.userId, {
      first_name: firstName,
      name: firstName,
      user_type: 'student',
      status: 'active',
      phone_verified: true,
      onboarding_completed: false, // Triggers onboarding in student app
    }, supabase);

    // 3. Create student profile first (to get DB-generated student_id)
    let studentProfile;
    try {
      studentProfile = await createStudentProfile({
        user_id: auth.userId,
        enrollment_date: new Date().toISOString().split('T')[0],
        batch_id: link.batch_id || null,
        course_id: link.course_id || null,
        ms_teams_id: null,
        ms_teams_email: null,
        payment_status: link.amount_paid >= link.final_fee ? 'paid' : 'pending',
        total_fee: link.final_fee,
        fee_paid: link.amount_paid,
        fee_due: Math.max(0, link.final_fee - link.amount_paid),
        next_payment_date: null,
        lessons_completed: 0,
        assignments_completed: 0,
        total_watch_time: 0,
        last_activity_at: null,
        parent_contact: parentPhone || null,
        emergency_contact: null,
        notes: null,
      }, supabase);
    } catch (spError: any) {
      console.error('[Direct Enrollment] Failed to create student_profile:', spError?.message, spError?.details);
      return NextResponse.json(
        { error: 'Failed to create student profile. Please contact support.', details: spError?.message },
        { status: 500 }
      );
    }

    // Use DB-generated student_id as the canonical application number
    const applicationNumber = studentProfile.student_id;

    const { data: leadProfile, error: leadProfileError } = await supabase
      .from('lead_profiles')
      .insert({
        user_id: auth.userId,
        application_number: applicationNumber,
        source: 'direct_link',
        status: 'enrolled',
        // Personal
        father_name: fatherName || null,
        parent_phone: parentPhone || null,
        // Location
        country: country || 'India',
        state: state || null,
        city: city || null,
        district: district || null,
        pincode: pincode || null,
        address: address || null,
        // Academic
        applicant_category: applicantCategory || null,
        academic_data: academicData || null,
        caste_category: casteCategory || null,
        target_exam_year: targetExamYear ? Number(targetExamYear) : null,
        school_type: schoolType || null,
        // Course (pre-filled from link)
        interest_course: link.interest_course,
        selected_course_id: link.course_id || null,
        selected_center_id: link.center_id || null,
        learning_mode: link.learning_mode,
        // Phone
        phone_verified: true,
        phone_verified_at: phoneVerifiedAt || new Date().toISOString(),
        // Fee (from link)
        assigned_fee: link.total_fee,
        discount_amount: link.discount_amount,
        final_fee: link.final_fee,
        // Admin
        reviewed_by: link.created_by,
        reviewed_at: new Date().toISOString(),
        admin_notes: `Direct enrollment via link. Payment: ₹${link.amount_paid} via ${link.payment_method}${link.transaction_reference ? ` (Ref: ${link.transaction_reference})` : ''}`,
        // Form
        form_step_completed: 4,
      })
      .select()
      .single();

    if (leadProfileError) {
      console.error('[Direct Enrollment] Failed to create lead_profile:', leadProfileError.message, leadProfileError.details);
      // Don't block enrollment — lead_profile is for record-keeping
    }

    // 4. Create payment record for the direct payment
    const receiptNumber = `NR-DE-${Date.now().toString(36).toUpperCase()}`;
    await supabase
      .from('payments')
      .insert({
        user_id: auth.userId,
        student_profile_id: studentProfile.id,
        lead_profile_id: leadProfile?.id || null,
        amount: link.amount_paid,
        currency: 'INR',
        status: 'paid',
        payment_method: link.payment_method,
        receipt_number: receiptNumber,
        paid_at: link.payment_date || new Date().toISOString(),
        notes: `Direct payment. ${link.transaction_reference ? `Transaction: ${link.transaction_reference}` : ''}`,
      });

    // 6. Mark link as used
    await updateDirectEnrollmentLink(link.id, {
      status: 'used',
      used_by: auth.userId,
      used_at: new Date().toISOString(),
      lead_profile_id: leadProfile?.id || null,
      student_profile_id: studentProfile.id,
    }, supabase);

    // 7. Increment batch enrollment
    if (link.batch_id) {
      try {
        await incrementBatchEnrollment(link.batch_id, supabase);
      } catch (e) {
        console.warn('Failed to increment batch enrollment:', e);
      }
    }

    // 8. Create post_enrollment_details entry (for document collection later)
    await supabase
      .from('post_enrollment_details')
      .insert({
        student_profile_id: studentProfile.id,
        user_id: auth.userId,
        father_name: fatherName || null,
        caste_category: casteCategory || null,
        form_completed: false,
      });

    // 9. Initialize post-enrollment onboarding steps
    try {
      await initializeStudentOnboarding(studentProfile.id, auth.userId, 'direct', supabase);
    } catch (e) {
      console.warn('Failed to initialize onboarding steps:', e);
    }

    // 10. Send notification
    try {
      await notifyNewApplication({
        applicationNumber,
        studentName: firstName,
        email: auth.email || '',
        phone: auth.phone || '',
        course: link.interest_course,
        city: city || '',
        state: state || '',
      });
    } catch (e) {
      console.warn('Failed to send notification:', e);
    }

    return NextResponse.json({
      success: true,
      data: {
        applicationNumber,
        studentId: studentProfile.student_id,
        studentProfileId: studentProfile.id,
        message: 'Enrollment completed successfully! Welcome to Neram Classes.',
      },
    });
  } catch (error) {
    console.error('Error completing direct enrollment:', error);
    return NextResponse.json(
      { error: 'Failed to complete enrollment. Please try again.' },
      { status: 500 }
    );
  }
}