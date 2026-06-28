// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { updatePersonalDetails } from '@neram/database';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PATCH /api/crm/alumni/[id]/personal
 * Edit a student's personal details. `users` fields (phone, personal_email, DOB,
 * gender, name) update the user row; `lead_profiles` fields (father_name, city,
 * state, school_college) UPSERT (insert a lead row for MS-only students with none).
 * Body: { fields, adminId }
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!UUID_REGEX.test(params.id)) {
      return NextResponse.json({ error: 'Invalid user id.' }, { status: 400 });
    }
    const body = await request.json().catch(() => ({}));
    const { fields, adminId } = body;
    if (!adminId || !UUID_REGEX.test(adminId)) {
      return NextResponse.json({ error: 'adminId must be a valid UUID (Supabase user ID).' }, { status: 400 });
    }
    if (!fields || typeof fields !== 'object') {
      return NextResponse.json({ error: 'fields object is required.' }, { status: 400 });
    }

    const result = await updatePersonalDetails(params.id, fields, adminId);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('CRM personal-details update error:', error);
    return NextResponse.json({ error: error.message || 'Failed to update personal details' }, { status: 400 });
  }
}
