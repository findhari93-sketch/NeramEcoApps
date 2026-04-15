import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getDrawingQuestionById, enrichDrawingQuestions } from '@neram/database/queries/nexus';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { id } = await params;

    const question = await getDrawingQuestionById(id);
    if (!question) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    // Resolve user ID for attempt status
    const supabase = getSupabaseAdminClient();
    const { data: dbUser } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    // Enrich with repeat info, solution URLs, and attempt status
    const [enriched] = await enrichDrawingQuestions([question], dbUser?.id || null);

    return NextResponse.json({ question: enriched });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load question';
    console.error('Drawing question GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
