export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/college-hub/colleges/find-photo  { id, force?: boolean }
 *
 * Runs the same finder as the nightly cron for one college, now. `force`
 * (default true here, because a staff member asked) replaces existing images
 * and also runs on 'manual' colleges. Staff only (admin API middleware).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { processCollege } from '@/lib/college-photos/apply';
import { COLLEGE_PHOTO_COLUMNS, type CollegeForPhotos } from '@/lib/college-photos/types';
import { UPSTREAM_FAILED } from '@/lib/upstream-status';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { id?: string; force?: boolean } | null;
  if (!body?.id || !UUID.test(body.id)) return NextResponse.json({ error: 'Unknown college' }, { status: 400 });

  const supabase = getSupabaseAdminClient() as any;
  const { data: college, error } = await supabase.from('colleges').select(COLLEGE_PHOTO_COLUMNS).eq('id', body.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!college) return NextResponse.json({ error: 'Unknown college' }, { status: 404 });

  try {
    const report = await processCollege(supabase, college as CollegeForPhotos, { force: body.force !== false });
    return NextResponse.json({ success: true, report });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || 'Photo search failed' }, { status: UPSTREAM_FAILED });
  }
}
