export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/college-hub/colleges/upload  (multipart: file, collegeId, kind=cover|logo)
 *
 * Stores one staff-chosen cover photo (1600px WebP, landscape, 1000px wide or
 * more) or logo (256px WebP on white) in the public college-photos bucket and
 * returns its URL. The editor then saves it with PATCH /api/college-hub/colleges,
 * which marks the college 'manual'. Staff only (admin API middleware).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { PHOTO_BUCKET } from '@/lib/college-photos/apply';
import { coverWebp, logoWebp } from '@/lib/college-photos/images';
import { photoPath } from '@/lib/college-photos/match';

const MAX_BYTES = 15 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const collegeId = String(form?.get('collegeId') ?? '');
  const kind = form?.get('kind') === 'logo' ? 'logo' : 'cover';

  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose an image to upload' }, { status: 400 });
  if (!UUID.test(collegeId)) return NextResponse.json({ error: 'Unknown college' }, { status: 400 });
  if (file.type && !TYPES.includes(file.type)) return NextResponse.json({ error: 'Upload a JPEG, PNG, WebP or SVG image' }, { status: 400 });
  if (kind === 'cover' && file.type === 'image/svg+xml') return NextResponse.json({ error: 'A cover must be a photo, not an SVG' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image is larger than 15 MB' }, { status: 400 });

  const supabase = getSupabaseAdminClient() as any;
  const { data: college } = await supabase.from('colleges').select('slug').eq('id', collegeId).maybeSingle();
  if (!college) return NextResponse.json({ error: 'Unknown college' }, { status: 400 });

  let data: Buffer;
  let width: number | undefined;
  let height: number | undefined;
  try {
    const input = Buffer.from(await file.arrayBuffer());
    if (kind === 'cover') {
      const r = await coverWebp(input);
      data = r.data;
      width = r.width;
      height = r.height;
    } else {
      data = await logoWebp(input);
    }
  } catch (e) {
    const msg = (e as Error).message || '';
    const friendly = /wide/.test(msg)
      ? 'This photo is too small. Use one at least 1000px wide.'
      : /landscape/.test(msg)
        ? 'Use a landscape (wide) photo for the cover.'
        : /64px/.test(msg)
          ? 'This logo is too small. Use one at least 64px across.'
          : 'That file is not an image we can read.';
    return NextResponse.json({ error: friendly }, { status: 400 });
  }

  const path = photoPath(collegeId, college.slug as string, kind);
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, data, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
  if (error) return NextResponse.json({ error: `Upload failed: ${error.message}` }, { status: 500 });

  const url = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl as string;
  return NextResponse.json({ url, path, kind, w: width, h: height });
}
