export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { loadLink, linkSections, PROBLEM_TEXT } from '@/lib/college-update/link';
import { MAX_PHOTO_BYTES, PHOTO_BUCKET, PHOTO_TYPES, photoFolder } from '@/lib/college-dashboard/photos';

/**
 * POST /api/college-update/<token>/upload (multipart: file)
 * One photo for the update form, stored in the link's college folder. It only
 * shows on the public page after staff approve the Photos section.
 */
export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  const db = createAdminClient() as any;
  const { link, problem } = await loadLink(db, params.token);
  if (problem || !link) {
    const p = PROBLEM_TEXT[problem ?? 'invalid'];
    return NextResponse.json({ error: p.title }, { status: p.status });
  }
  if (!linkSections(link).includes('photos')) return NextResponse.json({ error: 'This link does not ask for photos.' }, { status: 403 });

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a photo to upload.' }, { status: 400 });
  const ext = PHOTO_TYPES[file.type];
  if (!ext) return NextResponse.json({ error: 'Upload a JPEG, PNG or WebP photo.' }, { status: 400 });
  if (file.size > MAX_PHOTO_BYTES) return NextResponse.json({ error: 'This photo is larger than 8 MB. Please use a smaller one.' }, { status: 400 });

  const path = `${photoFolder(link.college_id)}/${randomUUID()}.${ext}`;
  const { error } = await db.storage
    .from(PHOTO_BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, cacheControl: '31536000', upsert: false });
  if (error) return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
  const url = db.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl as string;
  return NextResponse.json({ url });
}
