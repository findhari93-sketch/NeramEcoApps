export const dynamic = 'force-dynamic';

/**
 * GET /api/gbp/overview?filter=unreplied|low|all&centre=<id>
 *
 * Everything Admin > Google reviews shows: whether the API is connected (and
 * which credentials are missing), recent sync runs, each centre's live Google
 * rating and how many reviews still need a reply, and the reviews themselves.
 * Staff only (admin API middleware). Low volume, no caching.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { readGbpConfig } from '@/lib/gbp/core';

const noStore = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest) {
  const filter = request.nextUrl.searchParams.get('filter') || 'unreplied';
  const centre = request.nextUrl.searchParams.get('centre');
  const supabase = getSupabaseAdminClient() as any;
  const config = readGbpConfig(process.env);

  try {
    let reviewsQuery = supabase
      .from('gbp_reviews')
      .select('id, google_review_name, center_id, reviewer_name, reviewer_photo_url, star_rating, comment, create_time, reply_comment, reply_update_time, reply_draft, reply_drafted_at, review_request_id')
      .order('create_time', { ascending: false, nullsFirst: false })
      .limit(200);
    if (filter === 'unreplied') reviewsQuery = reviewsQuery.is('reply_comment', null);
    if (filter === 'low') reviewsQuery = reviewsQuery.lte('star_rating', 3);
    if (centre) reviewsQuery = reviewsQuery.eq('center_id', centre);

    const [runs, centres, reviews, counts] = await Promise.all([
      supabase.from('gbp_sync_runs').select('*').order('started_at', { ascending: false }).limit(5),
      supabase
        .from('offline_centers')
        .select('id, name, city, google_place_id, gbp_location_name, rating, review_count, rating_checked_at, google_business_url')
        .eq('is_active', true)
        .order('display_order', { ascending: true }),
      reviewsQuery,
      supabase.from('gbp_reviews').select('center_id, star_rating, reply_comment'),
    ]);
    for (const r of [runs, centres, reviews, counts]) if (r.error) throw r.error;

    const pending = new Map<string, { unreplied: number; lowUnreplied: number }>();
    for (const r of (counts.data || []) as Array<{ center_id: string | null; star_rating: number | null; reply_comment: string | null }>) {
      if (!r.center_id || r.reply_comment) continue;
      const p = pending.get(r.center_id) || { unreplied: 0, lowUnreplied: 0 };
      p.unreplied += 1;
      if (r.star_rating != null && r.star_rating <= 3) p.lowUnreplied += 1;
      pending.set(r.center_id, p);
    }

    return NextResponse.json(
      {
        connected: 'config' in config,
        missing: 'missing' in config ? config.missing : [],
        runs: runs.data || [],
        centres: ((centres.data || []) as any[]).map((c) => ({ ...c, ...(pending.get(c.id) || { unreplied: 0, lowUnreplied: 0 }) })),
        reviews: reviews.data || [],
      },
      { headers: noStore },
    );
  } catch (error: any) {
    console.error('[gbp] overview', error?.message || error);
    return NextResponse.json({ error: 'Could not load Google reviews.' }, { status: 500, headers: noStore });
  }
}
