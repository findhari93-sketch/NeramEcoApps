import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { updateCampaignStudentStatus } from '@neram/database';

/**
 * PATCH /api/review-campaigns/[id]/students/[sid]
 * Body: { status?, screenshot_url?, notes? }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; sid: string } }
) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();
    const result = await updateCampaignStudentStatus(params.sid, body);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
