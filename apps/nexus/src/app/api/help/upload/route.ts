import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getSupabaseAdminClient } from '@neram/database';
import {
  HELP_BUCKET,
  HELP_UPLOAD_LIMIT,
  HELP_UPLOAD_PREFIX,
  HELP_WINDOW_MINUTES,
  clientIp,
  requesterKey,
} from '@/lib/help-request';

/**
 * POST /api/help/upload (public, no sign-in needed)
 *
 * The screenshot for a /help request. FormData with one `file`: JPEG, PNG or
 * WebP, up to 5MB (the form compresses it first, so real uploads are far smaller).
 *
 * Files land in `nexus-help/<network key>/`, which is also how uploads are rate
 * limited: the folder is listed and anything past HELP_UPLOAD_LIMIT inside the
 * window is refused. The key is an HMAC of the IP, never the IP itself.
 *
 * Returns { path, url }. /api/help takes the path back and works the public URL
 * out itself, so a request can only ever point at a file uploaded here.
 */

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export async function POST(request: NextRequest) {
  try {
    const key = requesterKey(clientIp(request.headers), process.env.SUPABASE_SERVICE_ROLE_KEY) ?? 'unknown-network';
    const supabase = getSupabaseAdminClient();
    const folder = `${HELP_UPLOAD_PREFIX}/${key}`;

    const since = Date.now() - HELP_WINDOW_MINUTES * 60 * 1000;
    const { data: existing } = await supabase.storage.from(HELP_BUCKET).list(folder, { limit: 100 });
    const recent = (existing ?? []).filter((f) => f.created_at && new Date(f.created_at).getTime() >= since).length;
    if (recent >= HELP_UPLOAD_LIMIT) {
      return NextResponse.json(
        { error: 'Too many screenshots for now. Please send your request without one.' },
        { status: 429, headers: { 'Retry-After': String(HELP_WINDOW_MINUTES * 60) } },
      );
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file was attached.' }, { status: 400 });
    }
    const ext = EXTENSIONS[file.type];
    if (!ext) {
      return NextResponse.json({ error: 'Please attach a JPG, PNG or WebP image.' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'That image is over 5MB. Please pick a smaller one.' }, { status: 400 });
    }

    const path = `${folder}/${Date.now()}_${randomBytes(4).toString('hex')}.${ext}`;
    const { error } = await supabase.storage
      .from(HELP_BUCKET)
      .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
    if (error) {
      console.error(`[help upload] ${error.message}`);
      return NextResponse.json({ error: 'The screenshot did not upload. You can still send your request.' }, { status: 500 });
    }

    const url = supabase.storage.from(HELP_BUCKET).getPublicUrl(path).data.publicUrl;
    return NextResponse.json({ path, url });
  } catch (err) {
    console.error(`[help upload] ${err instanceof Error ? err.message : 'failed'}`);
    return NextResponse.json({ error: 'The screenshot did not upload. You can still send your request.' }, { status: 500 });
  }
}
