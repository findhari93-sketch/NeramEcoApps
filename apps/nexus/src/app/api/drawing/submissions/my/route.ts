import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getStudentDrawingSubmissions } from '@neram/database/queries/nexus';

export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const params = request.nextUrl.searchParams;
    const filters = {
      status: params.get('status') || undefined,
      question_id: params.get('question_id') || undefined,
      limit: params.get('limit') ? parseInt(params.get('limit')!) : 50,
      offset: params.get('offset') ? parseInt(params.get('offset')!) : 0,
    };

    const submissions = await getStudentDrawingSubmissions(user.id, filters);
    return NextResponse.json({ submissions });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load submissions';
    console.error('My submissions GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
