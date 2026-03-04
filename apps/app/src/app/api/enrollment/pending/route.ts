// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import {
  getSupabaseAdminClient,
  getActiveEnrollmentLinkForUser,
} from '@neram/database';

const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL || 'https://neramclasses.com';

// GET /api/enrollment/pending - Check for pending direct enrollment
export async function GET(request: NextRequest) {
  try {
    // Verify Firebase token
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ hasPending: false });
    }

    const token = authHeader.split('Bearer ')[1];
    const decoded = await verifyIdToken(token);

    if (!decoded.email) {
      return NextResponse.json({ hasPending: false });
    }

    const supabase = getSupabaseAdminClient();

    // Check for active enrollment link matching user's email
    const link = await getActiveEnrollmentLinkForUser(decoded.email, supabase);

    if (!link) {
      return NextResponse.json({ hasPending: false });
    }

    // Get course name if available
    let courseName = null;
    if (link.course_id) {
      const { data: course } = await supabase
        .from('courses')
        .select('name')
        .eq('id', link.course_id)
        .single();
      courseName = course?.name || null;
    }

    return NextResponse.json({
      hasPending: true,
      enrollmentUrl: `${MARKETING_URL}/en/enroll?token=${link.token}`,
      courseName: courseName || link.interest_course?.toUpperCase(),
      expiresAt: link.expires_at,
      studentName: link.student_name,
    });
  } catch (error) {
    console.error('Error checking pending enrollment:', error);
    return NextResponse.json({ hasPending: false });
  }
}
