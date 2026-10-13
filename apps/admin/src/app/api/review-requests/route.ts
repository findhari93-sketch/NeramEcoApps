export const dynamic = 'force-dynamic';

/**
 * GET  /api/review-requests  every review link, newest first, with the review's
 *      state, the centre, and whether the student will see a Google step.
 * POST /api/review-requests  { items: ReviewRequestInput[] }  make up to 100 links.
 *      A known student who already has a live link gets that link back, so
 *      pressing the button twice never kills a link already sent.
 *
 * Staff only (admin API middleware). Review links are low volume, so no caching.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import {
  createReviewRequest,
  listReviewRequests,
  resolveGoogleTarget,
  sanitizeReviewRequestInput,
  type ReviewCentre,
  type ReviewPlatformLink,
} from '@neram/database/queries';
import { getRequestAdminId } from '@/lib/request-admin';
import { reviewReminderMessage, reviewRequestMessage, reviewRequestUrl } from '@/lib/marketing-links';
import { greetingName, reminderFor } from '@/lib/review-requests-view';

const NO_STORE = { 'Cache-Control': 'no-store' };
const MAX_BULK = 100;

async function loadCentres(supabase: ReturnType<typeof getSupabaseAdminClient>) {
  const [{ data: centres }, { data: links }] = await Promise.all([
    (supabase.from('offline_centers' as never) as any)
      .select('id, name, city, center_type, google_place_id, google_reviews_url, is_active')
      .order('display_order', { ascending: true }),
    (supabase.from('review_platform_urls' as never) as any).select('center_id, platform, review_url').eq('is_active', true),
  ]);
  return { centres: (centres || []) as Array<ReviewCentre & { is_active: boolean }>, links: (links || []) as ReviewPlatformLink[] };
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdminClient();
    const [rows, { centres, links }] = await Promise.all([listReviewRequests({}, supabase as any), loadCentres(supabase)]);
    const headquarters = centres.find((c) => c.center_type === 'headquarters') || null;
    const origin = request.nextUrl.origin;
    const configured = process.env.NEXT_PUBLIC_MARKETING_URL;

    const requests = rows.map((r) => {
      const centre = centres.find((c) => c.id === r.center_id) || null;
      const google = resolveGoogleTarget({ learningMode: r.learning_mode, centre, headquarters, links });
      const url = reviewRequestUrl(r.token, { adminOrigin: origin, configured });
      const remind = reminderFor(r);
      return {
        ...r,
        url,
        message: reviewRequestMessage(greetingName(r.student_name), url, r.college_admitted),
        reminder: remind ? { platform: remind, message: reviewReminderMessage(greetingName(r.student_name), url, remind) } : null,
        google_centre: google?.centerName ?? null,
      };
    });

    return NextResponse.json(
      {
        requests,
        centres: centres
          .filter((c) => c.is_active)
          .map((c) => ({
            id: c.id,
            name: c.name,
            city: c.city,
            center_type: c.center_type,
            has_google: Boolean(resolveGoogleTarget({ learningMode: 'offline', centre: c, headquarters: null, links })),
          })),
      },
      { headers: NO_STORE },
    );
  } catch (error: any) {
    console.error('[review-requests] list', error?.message || error);
    return NextResponse.json({ error: 'Could not load review requests.' }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(request: NextRequest) {
  const adminId = getRequestAdminId(request);
  const body = await request.json().catch(() => null);
  const items: unknown[] = Array.isArray(body?.items) ? body.items : body ? [body] : [];
  if (!items.length) return NextResponse.json({ error: 'Add at least one student.' }, { status: 400 });
  if (items.length > MAX_BULK) return NextResponse.json({ error: `At most ${MAX_BULK} at a time.` }, { status: 400 });

  // Check every row before writing any, so a typo in row 40 does not leave 39 links half made.
  const checked = items.map((raw) => sanitizeReviewRequestInput((raw || {}) as Record<string, unknown>));
  const bad = checked.findIndex((c) => !c.ok);
  if (bad >= 0) {
    const failed = checked[bad] as { ok: false; errors: Record<string, string> };
    return NextResponse.json({ error: 'Please fix the highlighted fields.', row: bad, fieldErrors: failed.errors }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdminClient();
    const origin = request.nextUrl.origin;
    const configured = process.env.NEXT_PUBLIC_MARKETING_URL;
    const created = [];
    for (const c of checked) {
      if (!c.ok) continue;
      const { request: row, reused } = await createReviewRequest(c.value, adminId, supabase as any, { regenerate: body?.regenerate === true });
      const url = reviewRequestUrl(row.token, { adminOrigin: origin, configured });
      created.push({
        id: row.id,
        student_name: row.student_name,
        reused,
        url,
        message: reviewRequestMessage(greetingName(row.student_name), url, row.college_admitted),
        phone: row.phone,
      });
    }
    return NextResponse.json({ created }, { headers: NO_STORE });
  } catch (error: any) {
    console.error('[review-requests] create', error?.message || error);
    return NextResponse.json({ error: 'Could not create the review links.' }, { status: 500, headers: NO_STORE });
  }
}
