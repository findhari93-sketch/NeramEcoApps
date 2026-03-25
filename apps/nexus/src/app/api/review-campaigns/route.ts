import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  listReviewCampaigns,
  createReviewCampaign,
} from '@neram/database';

/**
 * GET /api/review-campaigns?status=&limit=&offset=
 */
export async function GET(request: NextRequest) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));

    const status = request.nextUrl.searchParams.get('status') as any;
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50', 10);
    const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0', 10);

    const result = await listReviewCampaigns({ status: status || undefined, limit, offset });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load campaigns';
    console.error('Campaigns GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/review-campaigns
 * Body: { name, description?, target_city?, target_center_id?, platforms, channels? }
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    // Get caller user
    const { data: caller } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!caller) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, target_city, target_center_id, platforms, channels } = body;

    if (!name || !platforms || !Array.isArray(platforms) || platforms.length === 0) {
      return NextResponse.json({ error: 'Name and at least one platform required' }, { status: 400 });
    }

    const result = await createReviewCampaign({
      name,
      description,
      target_city,
      target_center_id,
      platforms,
      channels,
      created_by: caller.id,
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ campaign: result.campaign }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create campaign';
    console.error('Campaigns POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
