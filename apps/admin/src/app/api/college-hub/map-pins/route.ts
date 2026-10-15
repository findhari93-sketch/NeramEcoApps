export const dynamic = 'force-dynamic';

/**
 * Map pins for active colleges. Staff only (admin API middleware).
 *
 * GET -> { counts: { total, with_pin, suggested, missing }, data: PinRow[] }
 *        data = active colleges without a pin, the ones with a suggestion first.
 * PATCH { college_id, action: 'accept' }                   copy the suggestion to latitude/longitude, clear it
 *       { college_id, action: 'set', latitude, longitude } set the pin directly (also clears any suggestion)
 *       { college_id, action: 'dismiss' }                  clear the suggestion
 * -> { success, college: { id, latitude, longitude }, revalidated }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { isValidLatLng, roundCoord } from '@/lib/college-map-pins/geo';
import { revalidateCollegePage } from '@/lib/marketing-revalidate';

const colleges = () => getSupabaseAdminClient().from('colleges' as never) as any;

const CLEAR_SUGGESTION = {
  geo_suggested_lat: null,
  geo_suggested_lng: null,
  geo_suggested_source: null,
  geo_suggested_label: null,
  geo_suggested_at: null,
};

interface PinRow {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  slug: string | null;
  state_slug: string | null;
  latitude: number | null;
  longitude: number | null;
  geo_suggested_lat: number | null;
  geo_suggested_lng: number | null;
  geo_suggested_source: string | null;
  geo_suggested_label: string | null;
  geo_suggested_at: string | null;
}

export async function GET() {
  const active = () => colleges().select('id', { count: 'exact', head: true }).eq('status', 'active');
  const [total, withPin, suggested, list] = await Promise.all([
    active(),
    active().not('latitude', 'is', null),
    active().is('latitude', null).not('geo_suggested_lat', 'is', null),
    colleges()
      .select(
        'id, name, city, state, slug, state_slug, latitude, longitude, geo_suggested_lat, geo_suggested_lng, geo_suggested_source, geo_suggested_label, geo_suggested_at',
      )
      .eq('status', 'active')
      .is('latitude', null)
      .order('name')
      .limit(1000),
  ]);
  const failed = [total, withPin, suggested, list].find((r) => r.error);
  if (failed) return NextResponse.json({ error: failed.error.message }, { status: 500 });

  const rows = ((list.data ?? []) as PinRow[]).map((r) => ({
    ...r,
    geo_suggested_lat: r.geo_suggested_lat === null ? null : Number(r.geo_suggested_lat),
    geo_suggested_lng: r.geo_suggested_lng === null ? null : Number(r.geo_suggested_lng),
  }));
  rows.sort((a, b) => Number(b.geo_suggested_lat !== null) - Number(a.geo_suggested_lat !== null));

  const t = total.count ?? 0;
  const p = withPin.count ?? 0;
  const s = suggested.count ?? 0;
  return NextResponse.json(
    { counts: { total: t, with_pin: p, suggested: s, missing: Math.max(0, t - p - s) }, data: rows },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const collegeId = typeof body?.college_id === 'string' ? body.college_id : '';
  const action = body?.action;
  if (!collegeId) return NextResponse.json({ error: 'college_id required' }, { status: 400 });

  const { data: found, error: findErr } = await colleges()
    .select('id, slug, state_slug, geo_suggested_lat, geo_suggested_lng')
    .eq('id', collegeId)
    .maybeSingle();
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });
  if (!found) return NextResponse.json({ error: 'College not found.' }, { status: 404 });
  const college = found as Pick<PinRow, 'id' | 'slug' | 'state_slug' | 'geo_suggested_lat' | 'geo_suggested_lng'>;

  const now = new Date().toISOString();
  let update: Record<string, unknown>;
  if (action === 'accept') {
    const lat = college.geo_suggested_lat === null ? null : Number(college.geo_suggested_lat);
    const lng = college.geo_suggested_lng === null ? null : Number(college.geo_suggested_lng);
    if (!isValidLatLng(lat, lng)) return NextResponse.json({ error: 'There is no suggestion to accept.' }, { status: 409 });
    update = { latitude: lat, longitude: lng, ...CLEAR_SUGGESTION, updated_at: now };
  } else if (action === 'set') {
    const lat = typeof body?.latitude === 'string' ? Number(body.latitude) : body?.latitude;
    const lng = typeof body?.longitude === 'string' ? Number(body.longitude) : body?.longitude;
    if (!isValidLatLng(lat, lng)) {
      return NextResponse.json({ error: 'Latitude must be -90 to 90 and longitude -180 to 180.' }, { status: 400 });
    }
    update = { latitude: roundCoord(lat), longitude: roundCoord(lng as number), ...CLEAR_SUGGESTION, updated_at: now };
  } else if (action === 'dismiss') {
    update = { ...CLEAR_SUGGESTION };
  } else {
    return NextResponse.json({ error: "action must be 'accept', 'set' or 'dismiss'" }, { status: 400 });
  }

  const { data, error } = await colleges().update(update).eq('id', collegeId).select('id, latitude, longitude').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const revalidated =
    action === 'dismiss' ? false : await revalidateCollegePage(college, { adminOrigin: request.nextUrl.origin });
  return NextResponse.json({ success: true, college: data, revalidated });
}
