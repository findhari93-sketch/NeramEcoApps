// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { findSimilarRecalls } from '@/lib/exam-recall-ai';

/**
 * POST /api/exam-recall/match
 *
 * Find similar recalled questions using AI semantic matching.
 * Body: { query_text, classroom_id, exam_year? }
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const { query_text, classroom_id, exam_year } = body;

    if (!query_text || !classroom_id) {
      return NextResponse.json(
        { error: 'Missing required fields: query_text, classroom_id' },
        { status: 400 },
      );
    }

    // Fetch existing thread versions for comparison
    let threadQuery = supabase
      .from('nexus_exam_recall_threads')
      .select('id, exam_date, session_number')
      .eq('classroom_id', classroom_id);

    if (exam_year) {
      threadQuery = threadQuery.eq('exam_year', exam_year);
    }

    const { data: threads, error: threadsErr } = await threadQuery;

    if (threadsErr) throw threadsErr;

    if (!threads || threads.length === 0) {
      return NextResponse.json({ matches: [] });
    }

    const threadIds = (threads as any[]).map((t) => t.id);
    const threadMap = new Map((threads as any[]).map((t) => [t.id, t]));

    // Get latest approved version text for each thread
    const { data: versions, error: versionsErr } = await supabase
      .from('nexus_exam_recall_versions')
      .select('thread_id, recall_text')
      .in('thread_id', threadIds)
      .eq('status', 'approved')
      .order('version_number', { ascending: false });

    if (versionsErr) throw versionsErr;

    // Build recall entries (one per thread, latest version text)
    const seenThreads = new Set<string>();
    const recallEntries: Array<{
      id: string;
      text: string;
      exam_date: string;
      session_number: number;
    }> = [];

    for (const v of (versions || []) as any[]) {
      if (!seenThreads.has(v.thread_id)) {
        seenThreads.add(v.thread_id);
        const thread = threadMap.get(v.thread_id);
        if (thread) {
          recallEntries.push({
            id: v.thread_id,
            text: v.recall_text,
            exam_date: thread.exam_date,
            session_number: thread.session_number,
          });
        }
      }
    }

    const matches = await findSimilarRecalls(query_text, recallEntries);

    return NextResponse.json({ matches });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to find similar recalls';
    console.error('[exam-recall/match] POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
