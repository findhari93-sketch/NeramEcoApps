import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getReviewCampaignById,
  updateReviewCampaign,
  deleteReviewCampaign,
} from '@neram/database';

/**
 * GET /api/review-campaigns/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));
    const campaign = await getReviewCampaignById(params.id);
    if (!campaign) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ campaign });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load campaign';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * PATCH /api/review-campaigns/[id]
 * Body: { name?, description?, status?, platforms?, channels? }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();
    const result = await updateReviewCampaign(params.id, body);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update campaign';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/review-campaigns/[id]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));
    const result = await deleteReviewCampaign(params.id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete campaign';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
