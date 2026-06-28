// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAlumniCount } from '@neram/database';

/**
 * GET /api/crm/alumni/counts
 * Lightweight headcount for the Alumni tab badge. Lets the badge render the right
 * number on first paint while the full alumni directory stays lazy (only loaded
 * when the Alumni tab is opened). Head/count-only query, no rows transferred.
 */
export async function GET() {
  try {
    const alumni = await getAlumniCount();
    return NextResponse.json({ alumni });
  } catch (error: any) {
    console.error('CRM alumni counts error:', error);
    return NextResponse.json({ error: error.message || 'Failed to count alumni' }, { status: 500 });
  }
}
