export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getUserJourneyDetail,
  adminUpdateUserProfile,
  adminUpdateLeadProfile,
  createAdminClient,
  recordUserHistory,
} from '@neram/database';

/**
 * Fields staff may fill in when a student has no application yet. The same set the
 * Edit Application dialog edits, plus academic_data for the current class, which
 * Nexus reads to set the student's class.
 */
const NEW_APPLICATION_FIELDS = [
  'father_name',
  'applicant_category',
  'academic_data',
  'interest_course',
  'learning_mode',
  'school_type',
  'caste_category',
  'target_exam_year',
  'city',
  'state',
  'pincode',
] as const;

class HttpError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/**
 * Create the application for a student who has none: someone added by staff, or
 * whose form sits on a record that was never linked and could not be found.
 * Staff fill it in from what the student told them.
 */
async function createApplication(userId: string, updates: Record<string, unknown>, adminId: string) {
  const supabase = createAdminClient() as any;

  const [{ data: existing, error: existingError }, { data: user, error: userError }] = await Promise.all([
    supabase.from('lead_profiles').select('id').eq('user_id', userId).is('deleted_at', null).limit(1),
    supabase.from('users').select('id, user_type').eq('id', userId).maybeSingle(),
  ]);
  if (existingError) throw existingError;
  if (userError) throw userError;
  if (!user) throw new HttpError('User not found', 404);
  if (existing?.length) {
    throw new HttpError('This student already has an application. Reload the page to edit it.', 409);
  }

  const row: Record<string, unknown> = {};
  for (const field of NEW_APPLICATION_FIELDS) {
    const value = updates[field];
    if (value !== undefined && value !== null && value !== '') row[field] = value;
  }
  if (!Object.keys(row).length) throw new HttpError('Fill in at least one field.', 400);

  const { data, error } = await supabase
    .from('lead_profiles')
    .insert({
      user_id: userId,
      ...row,
      source: 'manual',
      // An enrolled student is past the review stage; anyone else starts at submitted.
      status: user.user_type === 'student' ? 'enrolled' : 'submitted',
    })
    .select()
    .single();
  if (error) throw error;

  await recordUserHistory(supabase, userId, 'lead_profile.created', null, row, adminId);
  return data;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const detail = await getUserJourneyDetail(params.id);

    if (!detail) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (error: any) {
    console.error('CRM user detail error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch user detail' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { userUpdates, leadUpdates, studentProfileUpdates, adminId } = body;

    if (!adminId) {
      return NextResponse.json(
        { error: 'adminId is required' },
        { status: 400 }
      );
    }

    const results: any = {};

    // Update user fields if provided
    if (userUpdates && Object.keys(userUpdates).length > 0) {
      results.user = await adminUpdateUserProfile(
        params.id,
        userUpdates,
        adminId
      );
    }

    // Update lead profile fields if provided. Without a profileId the student has
    // no application yet, and this creates one.
    if (leadUpdates && leadUpdates.profileId) {
      const { profileId, ...updates } = leadUpdates;
      if (Object.keys(updates).length > 0) {
        results.leadProfile = await adminUpdateLeadProfile(
          profileId,
          updates,
          adminId
        );
      }
    } else if (leadUpdates && Object.keys(leadUpdates).length > 0) {
      results.leadProfile = await createApplication(params.id, leadUpdates, adminId);
    }

    // Update student profile fields if provided (fees)
    if (studentProfileUpdates && studentProfileUpdates.studentProfileId) {
      const { studentProfileId, ...spUpdates } = studentProfileUpdates;
      if (Object.keys(spUpdates).length > 0) {
        const supabase = createAdminClient();
        // Verify the student profile belongs to this user
        const { data, error: spError } = await supabase
          .from('student_profiles')
          .update({ ...spUpdates, updated_at: new Date().toISOString() })
          .eq('id', studentProfileId)
          .eq('user_id', params.id)
          .select()
          .single();
        if (spError) throw spError;
        results.studentProfile = data;
      }
    }

    return NextResponse.json({ success: true, ...results });
  } catch (error: any) {
    console.error('CRM user update error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update user' },
      { status: error instanceof HttpError ? error.status : 500 }
    );
  }
}
