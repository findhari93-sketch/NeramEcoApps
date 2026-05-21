// @ts-nocheck
/**
 * GET /api/tools/josaa-predictor/years
 * Returns distinct years present in josaa_or_cr, descending.
 *
 * Public — no auth required. Used by the predictor form to populate
 * the Year dropdown + Compare-mode chips so new years (e.g. 2019/2020
 * after a scrape import) surface without a deploy.
 *
 * Node runtime (default) — @neram/database isn't edge-compatible (uses
 * crypto via Supabase SDK). Cached 6h via revalidate + s-maxage header.
 */
export const revalidate = 21600;

import { NextResponse } from 'next/server';
import { getJosaaYears, getSupabaseBrowserClient } from '@neram/database';

export async function GET() {
  try {
    const supabase = getSupabaseBrowserClient();
    const years = await getJosaaYears(supabase);
    return NextResponse.json(
      { years },
      { headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400' } },
    );
  } catch (err: any) {
    return NextResponse.json({ years: [], error: err?.message }, { status: 500 });
  }
}
