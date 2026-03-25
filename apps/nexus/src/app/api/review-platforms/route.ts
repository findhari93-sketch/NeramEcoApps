import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  getAllPlatformUrlsWithCenters,
  upsertReviewPlatformUrl,
  deleteReviewPlatformUrl,
} from '@neram/database';

/**
 * GET /api/review-platforms
 * List all review platform URLs with center info.
 */
export async function GET(request: NextRequest) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));
    const urls = await getAllPlatformUrlsWithCenters();
    return NextResponse.json({ urls });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load platform URLs';
    console.error('Review platforms GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/review-platforms
 * Create or update a platform URL.
 * Body: { center_id, platform, review_url, display_name? }
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    // Verify admin
    const { data: caller } = await supabase
      .from('users')
      .select('user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!caller || caller.user_type !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { center_id, platform, review_url, display_name } = body;

    if (!center_id || !platform || !review_url) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!['google', 'sulekha', 'justdial'].includes(platform)) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
    }

    const result = await upsertReviewPlatformUrl({ center_id, platform, review_url, display_name });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ url: result.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save platform URL';
    console.error('Review platforms POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/review-platforms?id={id}
 * Soft-delete a platform URL.
 */
export async function DELETE(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: caller } = await supabase
      .from('users')
      .select('user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!caller || caller.user_type !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    const result = await deleteReviewPlatformUrl(id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete';
    console.error('Review platforms DELETE error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
