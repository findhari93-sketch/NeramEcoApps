export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { actingAdminId } from '@/lib/fee-request';

const BUCKET = 'payment-qr-codes';
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];
const MAX = 2 * 1024 * 1024;

/**
 * POST /api/settings/payment-qr-codes/upload (multipart "file")
 *
 * An official QR image the bank or Google Pay issued for one exact amount.
 * Students see these on the Pay step, so the bucket is public; the image holds
 * nothing but the UPI ID and the amount, which the page shows anyway.
 */
export async function POST(request: NextRequest) {
  if (!actingAdminId(request)) return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: 'Use a PNG, JPEG or WebP image.' }, { status: 400 });
    if (file.size > MAX) return NextResponse.json({ error: 'The image must be under 2MB.' }, { status: 400 });

    const supabase = getSupabaseAdminClient();
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.some((b: any) => b.id === BUCKET)) {
      await supabase.storage.createBucket(BUCKET, { public: true, fileSizeLimit: MAX, allowedMimeTypes: ALLOWED });
    }
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { data, error } = await supabase.storage.from(BUCKET).upload(path, new Uint8Array(await file.arrayBuffer()), { contentType: file.type, upsert: false });
    if (error) return NextResponse.json({ error: `Upload failed: ${error.message}` }, { status: 500 });
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
    return NextResponse.json({ url: pub.publicUrl, path: data.path });
  } catch (error: any) {
    console.error('[payment-qr-codes/upload] failed:', error?.message);
    return NextResponse.json({ error: 'Could not upload the QR image.' }, { status: 500 });
  }
}
