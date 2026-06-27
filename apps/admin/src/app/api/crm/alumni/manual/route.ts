// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createManualAlumnus } from '@neram/database';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/crm/alumni/manual
 * Create a historical alumnus (pre-system) with no auth account, plus their
 * directory profile. Body: { name, email?, phone?, academicYear?, college_id?,
 * college_name?, course_branch?, linkedin_url?, instagram_url?, ..., adminId }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { adminId, ...fields } = body;

    if (!adminId || !UUID_REGEX.test(adminId)) {
      return NextResponse.json({ error: 'adminId must be a valid UUID (Supabase user ID).' }, { status: 400 });
    }
    if (!fields.name || !String(fields.name).trim()) {
      return NextResponse.json({ error: 'name is required.' }, { status: 400 });
    }

    const result = await createManualAlumnus(fields, adminId);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('CRM alumni manual create error:', error);
    return NextResponse.json({ error: error.message || 'Failed to add alumnus' }, { status: 500 });
  }
}
