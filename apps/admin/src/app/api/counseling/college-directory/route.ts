export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getCollegeDirectoryEntries,
  upsertCollegeDirectoryEntry,
  importCollegeDirectory,
  deleteCollegeDirectoryEntry,
} from '@neram/database';

/**
 * GET /api/counseling/college-directory?systemId=...
 * List all college directory entries for a counseling system.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const systemId = searchParams.get('systemId');

    if (!systemId) {
      return NextResponse.json({ error: 'Missing systemId' }, { status: 400 });
    }

    const entries = await getCollegeDirectoryEntries(systemId);
    return NextResponse.json({ entries, count: entries.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/counseling/college-directory
 * Bulk import or single upsert.
 * Body: { systemId, entries: [{ college_code, college_name, city?, district? }] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { systemId, entries } = body;

    if (!systemId || !entries || !Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json(
        { error: 'Missing systemId or entries array' },
        { status: 400 }
      );
    }

    if (entries.length === 1) {
      const result = await upsertCollegeDirectoryEntry(systemId, entries[0]);
      return NextResponse.json({ success: true, upserted: 1, entry: result });
    }

    const result = await importCollegeDirectory(systemId, entries);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/counseling/college-directory?id=...
 * Delete a single directory entry.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    await deleteCollegeDirectoryEntry(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
