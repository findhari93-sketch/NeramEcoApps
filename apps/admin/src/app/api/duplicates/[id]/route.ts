export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prepareCandidateMerge, DuplicateQueueError } from '@neram/database';
import type { DuplicateRelation } from '@neram/database';

const RELATIONS: DuplicateRelation[] = ['self', 'parent', 'unknown'];

/**
 * GET /api/duplicates/[id]?relation=self|parent|unknown
 * The pair, who survives a merge, what moves and what is saved as a family
 * contact, and whether the merge would be refused. `relation` previews the
 * drawer's "This number belongs to" choice instead of the detected guess.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const relationParam = request.nextUrl.searchParams.get('relation') as DuplicateRelation | null;
    const relation = relationParam && RELATIONS.includes(relationParam) ? relationParam : null;
    const result = await prepareCandidateMerge(params.id, relation);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof DuplicateQueueError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Duplicate preview error:', error);
    return NextResponse.json({ error: 'Could not build the merge preview.' }, { status: 500 });
  }
}
