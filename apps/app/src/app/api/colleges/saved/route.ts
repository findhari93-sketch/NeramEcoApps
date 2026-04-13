// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { verifyIdToken } from '@/lib/firebase-admin';

async function resolveUserId(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const decoded = await verifyIdToken(authHeader.substring(7));
    if (!decoded?.uid) return null;
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', decoded.uid)
      .single();
    return data?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * GET /api/colleges/saved
 * Returns saved colleges with details for the authenticated student.
 */
export async function GET(request: NextRequest) {
  const userId = await resolveUserId(request);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('user_saved_colleges')
    .select(`
      college_id,
      created_at,
      colleges:college_id (
        id, name, short_name, slug, state_slug, city, state,
        neram_tier, logo_url, nirf_rank_architecture, arch_index_score,
        total_barch_seats, annual_fee_approx
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const colleges = (data ?? []).map((row) => ({ ...row.colleges, saved_at: row.created_at }));
  return NextResponse.json({ colleges });
}

/**
 * DELETE /api/colleges/saved
 * Body: { college_id }
 */
export async function DELETE(request: NextRequest) {
  const userId = await resolveUserId(request);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { college_id } = await request.json();
  if (!college_id) return NextResponse.json({ error: 'college_id required' }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('user_saved_colleges')
    .delete()
    .eq('user_id', userId)
    .eq('college_id', college_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
