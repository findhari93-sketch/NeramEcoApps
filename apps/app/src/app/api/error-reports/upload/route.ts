export const dynamic = 'force-dynamic';

/**
 * Error-report screenshot upload (student PWA, Firebase auth).
 *
 * POST /api/error-reports/upload  - FormData { file }
 * Uploads to the shared `issue-screenshots` bucket and returns { path }.
 * The report itself goes to the Admin support queue, and POST
 * /api/error-reports absolutises this path before storing it.
 * Anyone signed in, same rule as the report route. Files land under the
 * uploader's own user id.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { requireSignedInRequester } from '@/lib/student-ticket';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const BUCKET_NAME = 'issue-screenshots';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSignedInRequester(req);
    if (auth instanceof NextResponse) return auth;

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Only JPEG, PNG, and WebP images are allowed' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File exceeds 5MB limit' }, { status: 400 });
    }

    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const filePath = `${auth.userId}/${Date.now()}.${ext}`;

    const supabase = getSupabaseAdminClient();
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, buffer, { contentType: file.type, upsert: false });

    if (uploadError) {
      console.error('[error-reports/upload] upload failed:', uploadError);
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }

    return NextResponse.json({ path: filePath }, { status: 201 });
  } catch (error) {
    console.error('[error-reports/upload] error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
