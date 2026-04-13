// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { verifyFirebaseToken } from '@/app/api/_lib/auth';

/**
 * GET  /api/colleges/saved
 * Returns array of saved college_ids for the authenticated student.
 * Auth: Firebase ID token in Authorization: Bearer header
 */
export async function GET(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('user_saved_colleges')
    .select('college_id')
    .eq('user_id', auth.userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ saved: (data ?? []).map((r) => r.college_id) });
}

/**
 * POST /api/colleges/saved
 * Body: { college_id: string, action: 'save' | 'unsave' }
 * Auth: Firebase ID token in Authorization: Bearer header
 */
export async function POST(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { college_id, action } = await request.json();
  if (!college_id || !['save', 'unsave'].includes(action)) {
    return NextResponse.json({ error: 'college_id and action (save|unsave) required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  if (action === 'save') {
    const { error } = await supabase
      .from('user_saved_colleges')
      .upsert({ user_id: auth.userId, college_id }, { onConflict: 'user_id,college_id' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supabase
      .from('user_saved_colleges')
      .delete()
      .eq('user_id', auth.userId)
      .eq('college_id', college_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, action });
}
