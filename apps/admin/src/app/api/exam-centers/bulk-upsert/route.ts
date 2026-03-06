import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  bulkUpsertNataExamCenters,
} from '@neram/database';

// POST /api/exam-centers/bulk-upsert — Bulk import from CSV
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rows } = body;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: 'rows array is required and must not be empty' },
        { status: 400 }
      );
    }

    if (rows.length > 1000) {
      return NextResponse.json(
        { error: 'Maximum 1000 rows per import' },
        { status: 400 }
      );
    }

    const client = getSupabaseAdminClient();
    const result = await bulkUpsertNataExamCenters(rows, client);

    return NextResponse.json({
      data: result,
      message: `Imported ${result.successful} of ${result.total} rows${result.errors.length > 0 ? ` with ${result.errors.length} errors` : ''}`,
    }, { status: 201 });
  } catch (error) {
    console.error('Error bulk upserting exam centers:', error);
    const msg = error instanceof Error ? error.message : 'Failed to bulk import';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
