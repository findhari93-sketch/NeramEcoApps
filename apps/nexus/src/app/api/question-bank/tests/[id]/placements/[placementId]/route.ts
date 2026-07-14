import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { deletePlacement } from '@neram/database';

/** DELETE /api/question-bank/tests/[id]/placements/[placementId] — remove a placement (soft). */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; placementId: string } },
) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;
    if (!['teacher', 'admin'].includes(access.caller.user_type)) {
      return NextResponse.json({ error: 'Only teachers can remove placements' }, { status: 403 });
    }
    await deletePlacement(params.placementId);
    return NextResponse.json({ data: { removed: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to remove placement';
    console.error('Placement DELETE error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
