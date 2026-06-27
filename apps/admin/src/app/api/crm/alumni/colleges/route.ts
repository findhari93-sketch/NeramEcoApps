// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAlumniColleges } from '@neram/database';

/**
 * GET /api/crm/alumni/colleges
 * Distinct colleges where Neram seniors studied, for the Hall of Fame curation
 * college filter.
 */
export async function GET() {
  try {
    const colleges = await getAlumniColleges();
    return NextResponse.json({ colleges });
  } catch (error: any) {
    console.error('CRM alumni colleges error:', error);
    return NextResponse.json({ error: error.message || 'Failed to load colleges' }, { status: 500 });
  }
}
