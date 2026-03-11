export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  importRankListEntries,
  importAllotmentListEntries,
  importHistoricalCutoffs,
  getSupabaseAdminClient,
} from '@neram/database';

const TABLE_MAP: Record<string, string> = {
  'rank-list': 'rank_list_entries',
  'allotment-list': 'allotment_list_entries',
  cutoffs: 'historical_cutoffs',
};

/**
 * POST /api/counseling/import
 * Bulk import rank lists, allotment lists, or cutoffs from parsed CSV data.
 * Body: { type, systemId, year, entries, createdBy, dryRun? }
 *
 * With dryRun: true, returns { existingCount } without importing.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, systemId, year, entries, createdBy, dryRun } = body;

    if (!type || !systemId || !year) {
      return NextResponse.json(
        { error: 'Missing required fields: type, systemId, year' },
        { status: 400 }
      );
    }

    // Dry run: return existing count for confirmation dialog
    if (dryRun) {
      const tableName = TABLE_MAP[type];
      if (!tableName) {
        return NextResponse.json({ existingCount: 0 });
      }

      const supabase = getSupabaseAdminClient();
      const { count, error } = await (supabase
        .from(tableName as any) as any)
        .select('*', { count: 'exact', head: true })
        .eq('counseling_system_id', systemId)
        .eq('year', year);

      if (error) throw error;
      return NextResponse.json({ existingCount: count || 0 });
    }

    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json(
        { error: 'No entries to import' },
        { status: 400 }
      );
    }

    const adminUser = createdBy || 'admin';
    const supabase = getSupabaseAdminClient();

    if (type === 'rank-list') {
      const result = await importRankListEntries(systemId, year, entries, adminUser);

      // Verify: count what's actually in the database now
      const { count: verifiedCount } = await supabase
        .from('rank_list_entries')
        .select('*', { count: 'exact', head: true })
        .eq('counseling_system_id', systemId)
        .eq('year', year);

      return NextResponse.json({
        success: true,
        message: `Imported ${result.inserted} rank list entries`,
        ...result,
        verifiedCount: verifiedCount || 0,
      });
    }

    if (type === 'allotment-list') {
      const result = await importAllotmentListEntries(systemId, year, entries, adminUser);

      const { count: verifiedCount } = await supabase
        .from('allotment_list_entries')
        .select('*', { count: 'exact', head: true })
        .eq('counseling_system_id', systemId)
        .eq('year', year);

      return NextResponse.json({
        success: true,
        message: `Imported ${result.inserted} allotment list entries`,
        ...result,
        verifiedCount: verifiedCount || 0,
      });
    }

    if (type === 'cutoffs') {
      const result = await importHistoricalCutoffs(systemId, year, entries, adminUser);

      const { count: verifiedCount } = await supabase
        .from('historical_cutoffs')
        .select('*', { count: 'exact', head: true })
        .eq('counseling_system_id', systemId)
        .eq('year', year);

      return NextResponse.json({
        success: true,
        message: `Imported ${result.upserted} cutoff records`,
        ...result,
        verifiedCount: verifiedCount || 0,
      });
    }

    return NextResponse.json(
      { error: `Unknown import type: ${type}. Use rank-list, allotment-list, or cutoffs` },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Counseling import error:', error);
    return NextResponse.json(
      { error: error.message || 'Import failed' },
      { status: 500 }
    );
  }
}
