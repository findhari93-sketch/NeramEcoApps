import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, promoteRecallToQB, refreshContributorSummary } from '@neram/database';
import type { QBConfidenceTier, NexusQBQuestionInsert } from '@neram/database';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const msUser = await verifyMsToken(authHeader);
    const supabase = getSupabaseAdminClient();

    // Only teachers/admins can promote
    const { data: caller } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!caller) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (!['teacher', 'admin'].includes((caller as any).user_type)) {
      return NextResponse.json({ error: 'Forbidden: teacher/admin only' }, { status: 403 });
    }

    const body = await request.json();
    const {
      threadId,
      paperId,
      confidenceTier,
      questionData,
      contributorUserIds,
    } = body as {
      threadId: string;
      paperId: string;
      confidenceTier: QBConfidenceTier;
      questionData: NexusQBQuestionInsert;
      contributorUserIds: string[];
    };

    if (!threadId || !paperId || !confidenceTier || !questionData) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const question = await promoteRecallToQB(
      threadId,
      paperId,
      confidenceTier,
      questionData,
      contributorUserIds || [],
      supabase
    );

    // Refresh denormalized summary
    await refreshContributorSummary(paperId, supabase);

    return NextResponse.json({ data: question }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[QB API] Error promoting recall:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
