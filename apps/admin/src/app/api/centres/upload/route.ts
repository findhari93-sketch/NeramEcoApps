export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/centres/upload - one centre photo (multipart: file, centreId, kind).
 * Saves a 1600px WebP for the page and a 1200x630 JPEG for the share card in
 * the public centre-photos bucket, with file names Google can read. Returns
 * the entry to add to offline_centers.photos; the editor saves it with PATCH.
 * Staff only (admin API middleware).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { PHOTO_KINDS, photoFileBase, type PhotoKind } from '@/lib/centre-editor';
import { makeRenditions } from '@/lib/centre-photo-renditions';

const BUCKET = 'centre-photos';
const MAX_BYTES = 15 * 1024 * 1024; // phone originals; the stored files are far smaller
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const centreId = String(form?.get('centreId') ?? '');
  const kindRaw = String(form?.get('kind') ?? 'classroom');
  const kind: PhotoKind = PHOTO_KINDS.some((k) => k.value === kindRaw) ? (kindRaw as PhotoKind) : 'classroom';

  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a photo to upload' }, { status: 400 });
  if (!UUID.test(centreId)) return NextResponse.json({ error: 'Unknown centre' }, { status: 400 });
  if (file.type && !TYPES.includes(file.type)) return NextResponse.json({ error: 'Upload a JPEG, PNG or WebP photo' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Photo is larger than 15 MB' }, { status: 400 });

  const supabase = getSupabaseAdminClient();
  const { data: centre } = await (supabase.from('offline_centers' as never) as any).select('city').eq('id', centreId).maybeSingle();
  if (!centre) return NextResponse.json({ error: 'Unknown centre' }, { status: 400 });

  let r;
  try {
    r = await makeRenditions(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'That file is not a photo we can read' }, { status: 400 });
  }

  const base = `${centreId}/${photoFileBase(centre.city as string, kind)}-${Date.now().toString(36)}`;
  const put = (path: string, body: Buffer, contentType: string) =>
    supabase.storage.from(BUCKET).upload(path, body, { contentType, cacheControl: '31536000', upsert: false });
  const [page, og] = await Promise.all([put(`${base}.webp`, r.page, 'image/webp'), put(`${base}-og.jpg`, r.og, 'image/jpeg')]);
  const failed = page.error || og.error;
  if (failed) return NextResponse.json({ error: `Upload failed: ${failed.message}` }, { status: 500 });

  const url = (path: string) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  return NextResponse.json({ url: url(`${base}.webp`), og: url(`${base}-og.jpg`), w: r.width, h: r.height, kind });
}
