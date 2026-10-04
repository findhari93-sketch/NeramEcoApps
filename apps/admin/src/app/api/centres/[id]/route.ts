export const dynamic = 'force-dynamic';

/**
 * GET   /api/centres/:id - one centre with its checklist.
 * PATCH /api/centres/:id - save the fields the public centre page shows, then
 *       purge the marketing cache so the page updates at once.
 * Staff only (admin API middleware).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { CENTRE_PHOTO_HOST, completeness, sanitizeCentrePatch, type CentreRow } from '@/lib/centre-editor';
import { MARKETING_CACHE_TAGS, revalidateMarketing } from '@/lib/marketing-revalidate';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const noStore = { 'Cache-Control': 'no-store' };

const table = () => getSupabaseAdminClient().from('offline_centers' as never) as any;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { data, error } = await table().select('*').eq('id', params.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ centre: { ...data, checklist: completeness(data as CentreRow) } }, { headers: noStore });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await request.json().catch(() => null);
  const { patch, errors } = sanitizeCentrePatch(body, CENTRE_PHOTO_HOST);
  if (Object.keys(errors).length) return NextResponse.json({ error: 'Some fields need fixing', fields: errors }, { status: 400 });
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to save' }, { status: 400 });

  const { data, error } = await table()
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select('*')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const revalidated = await revalidateMarketing([MARKETING_CACHE_TAGS.centers], { adminOrigin: request.nextUrl.origin });
  return NextResponse.json({ centre: { ...data, checklist: completeness(data as CentreRow) }, revalidated }, { headers: noStore });
}
