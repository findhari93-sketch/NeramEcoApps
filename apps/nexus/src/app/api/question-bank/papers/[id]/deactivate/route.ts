import { NextRequest, NextResponse } from 'next/server';
import { verifyQBStaff } from '@/lib/qb-auth';
import {
  bulkDeactivateQuestions,
} from '@neram/database';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const access = await verifyQBStaff(authHeader);
    if (!access.ok) return access.response;

    const result = await bulkDeactivateQuestions(params.id);

    return NextResponse.json({
      data: result,
      message: `${result.deactivated} questions deactivated`,
    }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Deactivate API] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
