// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAlumniProfileDetail, upsertAlumniProfile } from '@neram/database';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/crm/alumni/[id]
 * Full alumnus profile: shared journey aggregation + alumni_profiles + college +
 * a compact activity feed.
 */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!UUID_REGEX.test(params.id)) {
      return NextResponse.json({ error: 'Invalid alumnus id.' }, { status: 400 });
    }
    const detail = await getAlumniProfileDetail(params.id);
    if (!detail) return NextResponse.json({ error: 'Alumnus not found.' }, { status: 404 });
    return NextResponse.json(detail);
  } catch (error: any) {
    console.error('CRM alumni detail error:', error);
    return NextResponse.json({ error: error.message || 'Failed to load alumnus' }, { status: 500 });
  }
}

/**
 * PATCH /api/crm/alumni/[id]
 * Insert/update the alumnus directory profile (college, course, social links, ...).
 * Body: { fields: Partial<AlumniProfile>, adminId: string }
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!UUID_REGEX.test(params.id)) {
      return NextResponse.json({ error: 'Invalid alumnus id.' }, { status: 400 });
    }
    const body = await request.json().catch(() => ({}));
    const { fields, adminId } = body;
    if (!adminId || !UUID_REGEX.test(adminId)) {
      return NextResponse.json({ error: 'adminId must be a valid UUID (Supabase user ID).' }, { status: 400 });
    }
    if (!fields || typeof fields !== 'object') {
      return NextResponse.json({ error: 'fields object is required.' }, { status: 400 });
    }
    if (fields.college_status && !['counseling', 'studying', 'graduated'].includes(fields.college_status)) {
      return NextResponse.json({ error: 'Invalid college_status.' }, { status: 400 });
    }

    const profile = await upsertAlumniProfile(params.id, fields, adminId);
    return NextResponse.json({ success: true, profile });
  } catch (error: any) {
    console.error('CRM alumni update error:', error);
    return NextResponse.json({ error: error.message || 'Failed to update alumnus' }, { status: 500 });
  }
}
