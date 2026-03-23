import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { createUpload } from '@neram/database/queries';

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1 MB
const ALLOWED_MIME_PREFIX = 'image/';

/**
 * POST /api/exam-recall/upload
 *
 * Upload an image file for exam recall.
 * FormData: file, upload_type, version_id?, thread_id?
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const uploadType = formData.get('upload_type') as string | null;
    const versionId = formData.get('version_id') as string | null;
    const threadId = formData.get('thread_id') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'Missing file in form data' }, { status: 400 });
    }

    if (!uploadType) {
      return NextResponse.json({ error: 'Missing upload_type in form data' }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 },
      );
    }

    // Validate mime type
    if (!file.type.startsWith(ALLOWED_MIME_PREFIX)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only images are allowed' },
        { status: 400 },
      );
    }

    // Build storage path
    const now = new Date();
    const examYear = now.getFullYear();
    const examDate = now.toISOString().split('T')[0];
    const threadFolder = threadId || 'standalone';
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `exam-recall/${examYear}/${examDate}/${threadFolder}/${timestamp}_${safeName}`;

    // Upload to Supabase Storage
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from('uploads')
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('[exam-recall/upload] Storage upload error:', uploadError);
      return NextResponse.json({ error: 'Failed to upload file to storage' }, { status: 500 });
    }

    // Create upload record in DB
    const upload = await createUpload({
      user_id: user.id,
      version_id: versionId || null,
      thread_id: threadId || null,
      upload_type: uploadType as any,
      storage_path: storagePath,
      original_filename: file.name,
      mime_type: file.type,
      file_size_bytes: file.size,
    });

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('uploads')
      .getPublicUrl(storagePath);

    return NextResponse.json(
      {
        upload,
        public_url: urlData?.publicUrl || null,
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to upload file';
    console.error('[exam-recall/upload] POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
