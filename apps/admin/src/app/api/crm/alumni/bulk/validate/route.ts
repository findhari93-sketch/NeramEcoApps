// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { findAlumniDuplicates, matchCollegesByNames } from '@neram/database';

/**
 * POST /api/crm/alumni/bulk/validate
 * Dry run for the bulk-alumni importer. Writes nothing. For each row it resolves
 * the free-text college name against the catalog and flags likely duplicates
 * (against existing users). Body: { rows: [{ index, name, email, phone, college }] }
 * Returns: { matches: { [index]: { collegeMatch, duplicateOf } } }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const rows: any[] = Array.isArray(body.rows) ? body.rows : [];

    if (rows.length > 1000) {
      return NextResponse.json({ error: 'Too many rows (max 1000 per validation).' }, { status: 400 });
    }

    const normalized = rows.map((r, i) => ({
      index: typeof r.index === 'number' ? r.index : i,
      name: r.name ?? null,
      email: r.email ?? null,
      phone: r.phone ?? null,
      college: String(r.college || '').trim(),
    }));

    const [dupes, colleges] = await Promise.all([
      findAlumniDuplicates(normalized.map(({ index, name, email, phone }) => ({ index, name, email, phone }))),
      matchCollegesByNames(normalized.map((r) => r.college).filter(Boolean)),
    ]);

    const matches: Record<number, { collegeMatch: any; duplicateOf: any }> = {};
    for (const r of normalized) {
      matches[r.index] = {
        collegeMatch: r.college ? colleges[r.college.toLowerCase()] ?? null : null,
        duplicateOf: dupes[r.index] ?? null,
      };
    }

    return NextResponse.json({ matches });
  } catch (error: any) {
    console.error('CRM alumni bulk validate error:', error);
    return NextResponse.json({ error: error.message || 'Validation failed' }, { status: 500 });
  }
}
