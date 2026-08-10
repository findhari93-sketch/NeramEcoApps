// @ts-nocheck
/**
 * GET /api/tools/josaa-predictor/years
 * Returns distinct years present in josaa_or_cr, descending.
 *
 * Public, no auth required. Used by the predictor form to populate the
 * Year dropdown and Compare-mode chips so new years (e.g. 2019/2020 after
 * a scrape import) surface without a deploy.
 *
 * Node runtime (default), @neram/database is not edge-compatible (uses
 * crypto via Supabase SDK).
 *
 * Cached 1 hour. This was 5 minutes, which regenerated one path ~8,600 times a
 * month for a list that changes when a scrape import lands, i.e. roughly once a
 * year. An hour still surfaces a new year on the same working day without the
 * write volume.
 */
export const revalidate = 3600;

import { NextResponse } from 'next/server';
import { getJosaaYears, getSupabaseBrowserClient } from '@neram/database';

export async function GET() {
  try {
    const supabase = getSupabaseBrowserClient();
    const years = await getJosaaYears(supabase);
    return NextResponse.json(
      { years },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
    );
  } catch (err: any) {
    return NextResponse.json({ years: [], error: err?.message }, { status: 500 });
  }
}
