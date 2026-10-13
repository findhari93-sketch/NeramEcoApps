export const dynamic = 'force-dynamic';

/**
 * GET /api/centres/:id/review-links             the centre's Google, Justdial and Sulekha links
 * PUT /api/centres/:id/review-links  { platform, url }   set (or clear with an empty url) one link
 *
 * These decide where a past student is sent after leaving a review on the
 * website (the review link's thank-you screen), and feed the reviews page's
 * sameAs. Staff only (admin API middleware).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { REVIEW_LINK_PLATFORMS, validateReviewLink, type ReviewLinkPlatform } from '@/lib/review-links';
import { MARKETING_CACHE_TAGS, revalidateMarketing } from '@/lib/marketing-revalidate';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const noStore = { 'Cache-Control': 'no-store' };
const table = () => getSupabaseAdminClient().from('review_platform_urls' as never) as any;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { data, error } = await table().select('platform, review_url').eq('center_id', params.id).eq('is_active', true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const links: Partial<Record<ReviewLinkPlatform, string>> = {};
  for (const row of (data || []) as Array<{ platform: ReviewLinkPlatform; review_url: string }>) links[row.platform] = row.review_url;
  return NextResponse.json({ links }, { headers: noStore });
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const platform = body?.platform as ReviewLinkPlatform;
  if (!REVIEW_LINK_PLATFORMS.includes(platform)) return NextResponse.json({ error: 'Unknown platform.' }, { status: 400 });
  const checked = validateReviewLink(platform, body?.url);
  if ('error' in checked) return NextResponse.json({ error: checked.error }, { status: 400 });

  const now = new Date().toISOString();
  const { error } = checked.url
    ? await table().upsert(
        { center_id: params.id, platform, review_url: checked.url, is_active: true, updated_at: now },
        { onConflict: 'center_id,platform' },
      )
    : await table().update({ is_active: false, updated_at: now }).eq('center_id', params.id).eq('platform', platform);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // The reviews page lists these profiles in its sameAs (bounded wait, never fails the save).
  await revalidateMarketing([MARKETING_CACHE_TAGS.centers], { adminOrigin: request.nextUrl.origin });
  return NextResponse.json({ ok: true, url: checked.url }, { headers: noStore });
}
