// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  getSupabaseAdminClient,
  regenerateDirectEnrollmentLink,
  getDirectEnrollmentLinkById,
} from '@neram/database';

// POST /api/direct-enrollment/[id]/regenerate - Regenerate a link with new token
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { adminId } = body;

    if (!adminId) {
      return NextResponse.json(
        { error: 'Admin ID is required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();

    // Check if link exists
    const existing = await getDirectEnrollmentLinkById(id, supabase);
    if (!existing) {
      return NextResponse.json(
        { error: 'Direct enrollment link not found' },
        { status: 404 }
      );
    }

    if (existing.status === 'used') {
      return NextResponse.json(
        { error: 'Cannot regenerate a used link. The student has already completed enrollment.' },
        { status: 400 }
      );
    }

    // Generate new token
    const newToken = crypto.randomBytes(16).toString('base64url');

    // Regenerate
    const newLink = await regenerateDirectEnrollmentLink(id, newToken, adminId, supabase);

    // Fetch course/batch names for the response
    let courseName = null;
    let batchName = null;
    let centerName = null;

    if (newLink.course_id) {
      const { data: course } = await supabase
        .from('courses')
        .select('name')
        .eq('id', newLink.course_id)
        .single();
      courseName = course?.name || null;
    }

    if (newLink.batch_id) {
      const { data: batch } = await supabase
        .from('batches')
        .select('name')
        .eq('id', newLink.batch_id)
        .single();
      batchName = batch?.name || null;
    }

    if (newLink.center_id) {
      const { data: center } = await supabase
        .from('offline_centers')
        .select('name')
        .eq('id', newLink.center_id)
        .single();
      centerName = center?.name || null;
    }

    return NextResponse.json({
      success: true,
      data: {
        ...newLink,
        course_name: courseName,
        batch_name: batchName,
        center_name: centerName,
      },
    });
  } catch (error: any) {
    console.error('Error regenerating direct enrollment link:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to regenerate link' },
      { status: 500 }
    );
  }
}
