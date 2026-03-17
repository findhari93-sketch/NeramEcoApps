import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * POST /api/question-bank/upload-image
 *
 * Upload a question/option image to Supabase storage.
 * Body: FormData with 'file' field.
 * Returns: { url, path }
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    // Look up user
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type. Allowed: PNG, JPEG, WebP, GIF' }, { status: 400 });
    }

    // Validate file size (max 10 MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 400 });
    }

    const ext = file.name.split('.').pop() || 'png';
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    const filePath = `nexus/question-bank/${user.id}/${timestamp}_${random}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from('uploads')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      if (uploadError.message?.includes('not found')) {
        await supabase.storage.createBucket('uploads', { public: true });
        const { error: retryError } = await supabase.storage
          .from('uploads')
          .upload(filePath, buffer, { contentType: file.type, upsert: false });
        if (retryError) throw retryError;
      } else {
        throw uploadError;
      }
    }

    const { data: urlData } = supabase.storage
      .from('uploads')
      .getPublicUrl(filePath);

    return NextResponse.json({
      url: urlData.publicUrl,
      path: filePath,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    console.error('QB image upload error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
