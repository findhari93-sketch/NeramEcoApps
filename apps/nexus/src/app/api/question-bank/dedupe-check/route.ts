import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { findSimilarQuestions } from '@neram/database';

/**
 * POST /api/question-bank/dedupe-check   (teacher/admin only)
 * Flag near-duplicate questions before a teacher adds one to the bank.
 * Body: { text: string, exam_relevance?: 'JEE'|'NATA'|'BOTH', tag_ids?: string[] }
 * Returns up to 5 similar existing questions with a similarity score and usage count.
 */
export async function POST(request: NextRequest) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;
    if (!['teacher', 'admin'].includes(access.caller.user_type)) {
      return NextResponse.json({ error: 'Only teachers can run duplicate checks' }, { status: 403 });
    }

    const body = await request.json();
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (!text || text.length < 8) {
      // Too short to meaningfully dedupe.
      return NextResponse.json({ data: { candidates: [] } });
    }

    const examRelevance =
      body?.exam_relevance === 'JEE' || body?.exam_relevance === 'NATA' || body?.exam_relevance === 'BOTH'
        ? body.exam_relevance
        : null;
    const tagIds = Array.isArray(body?.tag_ids) ? body.tag_ids.filter((t: unknown) => typeof t === 'string') : null;

    const candidates = await findSimilarQuestions({ text, examRelevance, tagIds });

    // Classify for the UI: >=0.9 very likely duplicate, >=0.75 near-identical.
    const enriched = candidates.map((c) => ({
      ...c,
      verdict: c.similarity >= 0.9 ? 'likely_duplicate' : c.similarity >= 0.75 ? 'near_identical' : 'similar',
    }));

    return NextResponse.json({ data: { candidates: enriched } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to run duplicate check';
    console.error('QB dedupe-check error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
