import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { seedDrawingQuestions } from '@neram/database/queries/nexus';

export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user || !['teacher', 'admin'].includes(user.user_type)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const body = await request.json();
    const questions = Array.isArray(body) ? body : body.questions;

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ error: 'No questions provided' }, { status: 400 });
    }

    const count = await seedDrawingQuestions(questions);
    return NextResponse.json({ seeded: count }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Seed failed';
    console.error('Drawing seed error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
