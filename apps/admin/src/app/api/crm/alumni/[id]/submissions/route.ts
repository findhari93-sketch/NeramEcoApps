// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getStudentSubmissions } from '@neram/database';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/crm/alumni/[id]/submissions
 * The admin "Vault": every drawing this student ever submitted (published and
 * hidden), read-only. Powers the Works panel on the alumni drawer/profile.
 */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!UUID_REGEX.test(params.id)) {
      return NextResponse.json({ error: 'Invalid student id.' }, { status: 400 });
    }
    const submissions = await getStudentSubmissions(params.id);
    return NextResponse.json({ submissions });
  } catch (error: any) {
    console.error('CRM alumni submissions error:', error);
    return NextResponse.json({ error: error.message || 'Failed to load submissions' }, { status: 500 });
  }
}
