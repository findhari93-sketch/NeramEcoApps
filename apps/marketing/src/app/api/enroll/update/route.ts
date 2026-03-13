// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { verifyFirebaseToken } from '../../_lib/auth';

// PATCH /api/enroll/update - Update personal/academic details for an enrolled student
export async function PATCH(request: NextRequest) {
  try {
    const auth = await verifyFirebaseToken(request);
    if (!auth) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { leadProfileId, ...updates } = body;

    if (!leadProfileId) {
      return NextResponse.json(
        { error: 'leadProfileId is required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Verify ownership: the lead_profile must belong to the authenticated user
    const { data: leadProfile } = await supabase
      .from('lead_profiles')
      .select('id, user_id')
      .eq('id', leadProfileId)
      .single();

    if (!leadProfile) {
      return NextResponse.json(
        { error: 'Lead profile not found' },
        { status: 404 }
      );
    }

    if (leadProfile.user_id !== auth.userId) {
      return NextResponse.json(
        { error: 'You are not authorized to update this profile' },
        { status: 403 }
      );
    }

    // Only allow updating personal/academic fields — NOT fee, course, payment data
    const allowedFields: Record<string, string> = {
      firstName: 'first_name',
      fatherName: 'father_name',
      dateOfBirth: 'date_of_birth',
      gender: 'gender',
      country: 'country',
      state: 'state',
      city: 'city',
      district: 'district',
      pincode: 'pincode',
      address: 'address',
      applicantCategory: 'applicant_category',
      academicData: 'academic_data',
      casteCategory: 'caste_category',
      targetExamYear: 'target_exam_year',
      schoolType: 'school_type',
      parentPhone: 'parent_phone',
    };

    const updateData: Record<string, unknown> = {};
    for (const [clientKey, dbKey] of Object.entries(allowedFields)) {
      if (clientKey in updates) {
        updateData[dbKey] = updates[clientKey];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Handle target_exam_year as number
    if (updateData.target_exam_year) {
      updateData.target_exam_year = Number(updateData.target_exam_year);
    }

    const { error: updateError } = await supabase
      .from('lead_profiles')
      .update(updateData)
      .eq('id', leadProfileId);

    if (updateError) {
      console.error('[Enroll Update] Failed to update lead_profile:', updateError);
      return NextResponse.json(
        { error: 'Failed to update profile' },
        { status: 500 }
      );
    }

    // Also update the user's first_name if it was changed
    if (updateData.first_name) {
      await supabase
        .from('users')
        .update({ first_name: updateData.first_name, name: updateData.first_name })
        .eq('id', auth.userId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating enrollment details:', error);
    return NextResponse.json(
      { error: 'Failed to update enrollment details' },
      { status: 500 }
    );
  }
}
