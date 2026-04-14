import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getDrawingChecklistHeatmap } from '@neram/database/queries/nexus';

export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase.from('users').select('id, user_type').eq('ms_oid', msUser.oid).single();
    if (!user || !['teacher', 'admin'].includes(user.user_type ?? '')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const heatmap = await getDrawingChecklistHeatmap();
    return NextResponse.json({ heatmap });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
