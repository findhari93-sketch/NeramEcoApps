import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getSharePointStreamUrl } from '@/lib/sharepoint';

/**
 * POST /api/drawing/link-reference  (staff)
 *
 * Turn a pasted OneDrive/SharePoint IMAGE share link into a permanent reference
 * image. A share link is not directly embeddable in an <img> (it needs auth), and
 * Graph download URLs expire, so instead of storing the link we resolve it once,
 * download the bytes server-side, and re-upload to the public `drawing-references`
 * bucket. The caller gets back a normal public URL it can drop into a drawing
 * assignment's reference list exactly like an uploaded image.
 *
 * Body: { url }
 */
const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));

    const body = await request.json().catch(() => ({}));
    const url = String(body?.url || '').trim();
    if (!/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: 'Paste a valid OneDrive/SharePoint link.' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (user.user_type === 'student') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Resolve the share link to a temporary, pre-authenticated download URL.
    const downloadUrl = await getSharePointStreamUrl(url);
    const fileRes = await fetch(downloadUrl);
    if (!fileRes.ok) {
      return NextResponse.json({ error: 'Could not fetch the shared file.' }, { status: 502 });
    }

    let contentType = (fileRes.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (contentType === 'image/jpg') contentType = 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'That link is not an image. Use the document attachment instead.' }, { status: 415 });
    }

    const arrayBuffer = await fileRes.arrayBuffer();
    if (arrayBuffer.byteLength > 15 * 1024 * 1024) {
      return NextResponse.json({ error: 'That image is too large (over 15MB).' }, { status: 413 });
    }
    const buffer = new Uint8Array(arrayBuffer);

    const ext = EXT_BY_TYPE[contentType] || 'jpg';
    const filePath = `${user.id}/sp-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('drawing-references')
      .upload(filePath, buffer, { contentType, upsert: false });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from('drawing-references').getPublicUrl(filePath);

    return NextResponse.json({ url: urlData.publicUrl, path: filePath });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not import the linked image';
    console.error('Drawing link-reference error:', message);
    const status = message.includes('Invalid Microsoft token') || message.includes('Authorization') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
