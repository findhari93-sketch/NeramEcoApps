// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { bulkCreateManualAlumni } from '@neram/database';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ROWS = 500;

/**
 * POST /api/crm/alumni/bulk
 * Commit a batch of historical alumni (no auth accounts). Each row mirrors the
 * single-add contract of /api/crm/alumni/manual. Body: { adminId, rows: [{ name,
 * email?, phone?, academicYear?, college_id?, college_name?, course_branch?,
 * linkedin_url?, instagram_url? }] }
 * Returns: { successful, total, results: [{ index, success, userId?, error? }] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { adminId } = body;
    const rows: any[] = Array.isArray(body.rows) ? body.rows : [];

    if (!adminId || !UUID_REGEX.test(adminId)) {
      return NextResponse.json({ error: 'adminId must be a valid UUID (Supabase user ID).' }, { status: 400 });
    }
    if (!rows.length) {
      return NextResponse.json({ error: 'No rows to import.' }, { status: 400 });
    }
    if (rows.length > MAX_ROWS) {
      return NextResponse.json({ error: `Too many rows (max ${MAX_ROWS} per import).` }, { status: 400 });
    }
    if (rows.some((r) => !r?.name || !String(r.name).trim())) {
      return NextResponse.json({ error: 'Every row needs a name.' }, { status: 400 });
    }

    const result = await bulkCreateManualAlumni(rows, adminId);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('CRM alumni bulk create error:', error);
    return NextResponse.json({ error: error.message || 'Bulk import failed' }, { status: 500 });
  }
}
