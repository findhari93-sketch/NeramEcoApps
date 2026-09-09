import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { getQBExamTree } from '@neram/database';
import { TtlCache } from '@/lib/ttl-cache';

import { describeError } from '@/lib/api-errors';

/**
 * The exam tree, held for a few minutes.
 *
 * getQBExamTree reads the whole question-sources table and the whole active
 * question id list, both paginated at 1000, which is seven sequential round
 * trips. It was paying that on every mount of the questions page, and that page
 * fires four endpoints at once, so it was the single most expensive thing in the
 * module and the most cacheable: the tree only changes when a teacher publishes
 * a paper.
 *
 * The value is classroom-independent, so one key serves everyone. Module scope
 * means per warm instance, and a cold start simply pays the old cost once.
 */
const TREE_TTL_MS = 5 * 60 * 1000;
const treeCache = new TtlCache<Awaited<ReturnType<typeof getQBExamTree>>>(TREE_TTL_MS, 1);
const TREE_KEY = 'qb-exam-tree';

export async function GET(request: NextRequest) {
  try {
    const classroomId = request.nextUrl.searchParams.get('classroom_id') || null;

    const access = await verifyQBAccess(request.headers.get('Authorization'), classroomId);
    if (!access.ok) return access.response;

    let data = treeCache.get(TREE_KEY);
    if (!data) {
      data = await getQBExamTree();
      treeCache.set(TREE_KEY, data);
    }

    return NextResponse.json(
      { data },
      {
        status: 200,
        // Structure, not per-student truth. Matches the window the server-side
        // hold above uses, so the two cannot disagree by much.
        headers: { 'Cache-Control': 'private, max-age=300' },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[QB API] Error:', describeError(err));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
