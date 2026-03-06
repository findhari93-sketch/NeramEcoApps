import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  cloneCentersToNewYear,
} from '@neram/database';

// POST /api/exam-centers/clone-year — Clone centers from one year to another
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { source_year, target_year } = body;

    if (!source_year || !target_year) {
      return NextResponse.json(
        { error: 'source_year and target_year are required' },
        { status: 400 }
      );
    }

    if (source_year === target_year) {
      return NextResponse.json(
        { error: 'Source and target year must be different' },
        { status: 400 }
      );
    }

    const client = getSupabaseAdminClient();
    const rowsInserted = await cloneCentersToNewYear(source_year, target_year, client);

    return NextResponse.json({
      data: { rows_inserted: rowsInserted },
      message: `Cloned ${rowsInserted} centers from ${source_year} to ${target_year}`,
    }, { status: 201 });
  } catch (error) {
    console.error('Error cloning year:', error);
    const msg = error instanceof Error ? error.message : 'Failed to clone year';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
