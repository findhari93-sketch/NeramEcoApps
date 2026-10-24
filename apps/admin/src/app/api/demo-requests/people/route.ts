export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { searchDemoPeople } from '@/lib/demo/people-search';

export type { DemoPerson } from '@/lib/demo/people-search';

/**
 * GET /api/demo-requests/people?q=  (Add demo's "Search People")
 *
 * Searches users directly, unlike the CRM list: people who never signed in
 * (added at the desk), archived people and parent accounts all count here. A
 * number also finds the person it is a parent's or backup number of. Staff
 * accounts are left out. Staff only (middleware).
 */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('q') ?? '';
  // PostgREST or() syntax: keep commas, brackets and wildcards out of the term.
  const q = raw.replace(/[,()%*\\:"]/g, ' ').trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ people: [] });

  try {
    const people = await searchDemoPeople(getSupabaseAdminClient(), q);
    return NextResponse.json({ people });
  } catch (error) {
    console.error('demo people search failed:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
