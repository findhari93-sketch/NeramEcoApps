export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { buildCandidatePreview, QueueError } from '@/lib/duplicate-queue';

/**
 * GET /api/duplicates/[id] - the pair, who survives a merge, what moves, and
 * whether the merge would be refused.
 */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const result = await buildCandidatePreview(params.id);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof QueueError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Duplicate preview error:', error);
    return NextResponse.json({ error: 'Could not build the merge preview.' }, { status: 500 });
  }
}
