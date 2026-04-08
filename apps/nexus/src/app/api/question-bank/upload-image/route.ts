import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, rewriteStorageUrl } from '@neram/database';

// Allow up to 10 MB uploads (Next.js App Router body size config)
export const maxDuration = 30;

/**
 * POST /api/question-bank/upload-image
 *
 * Upload a question/option image to Supabase storage.
 * Body: FormData with 'file' field and optional 'subfolder' (e.g. 'options').
 * Returns: { url, path }
 */
export async function POST(request: NextRequest) {
  // --- 1. Verify Microsoft token ---
  let msUser;
  try {
    msUser = await verifyMsToken(request.headers.get('Authorization'));
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unknown auth error';
    console.error('QB upload: auth failed:', detail);
    return NextResponse.json(
      { error: `Auth failed: ${detail}` },
      { status: 401 },
    );
  }

  // --- 2. Get Supabase admin client ---
  let supabase;
  try {
    supabase = getSupabaseAdminClient();
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unknown DB config error';
    console.error('QB upload: Supabase client error:', detail);
    return NextResponse.json(
      { error: 'Server configuration error. Please contact support.' },
      { status: 500 },
    );
  }

  // --- 3. Look up user ---
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('ms_oid', msUser.oid)
    .single();

  if (userError || !user) {
    console.error('QB upload: user not found for oid:', msUser.oid, userError?.message);
    return NextResponse.json(
      { error: 'User not found. Please sign out and sign back in.' },
      { status: 404 },
    );
  }

  // --- 4. Parse and validate FormData ---
  let formData;
  try {
    formData = await request.formData();
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unknown';
    console.error('QB upload: formData parse error:', detail);
    return NextResponse.json(
      { error: 'Could not read upload data. The file may be too large.' },
      { status: 400 },
    );
  }

  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 });
  }

  // Validate file type
  const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json(
      { error: `Invalid file type "${file.type}". Allowed: PNG, JPEG, WebP, GIF` },
      { status: 400 },
    );
  }

  // Validate file size (max 10 MB)
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json(
      { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB.` },
      { status: 400 },
    );
  }

  // --- 5. Build storage path ---
  const ext = file.name.split('.').pop() || 'png';
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const subfolder = (formData.get('subfolder') as string | null) || '';
  const basePath = subfolder
    ? `nexus/question-bank/${user.id}/${subfolder}`
    : `nexus/question-bank/${user.id}`;
  const filePath = `${basePath}/${timestamp}_${random}.${ext}`;

  // --- 6. Upload to Supabase storage ---
  let arrayBuffer;
  try {
    arrayBuffer = await file.arrayBuffer();
  } catch (err) {
    console.error('QB upload: failed to read file buffer:', err);
    return NextResponse.json(
      { error: 'Failed to read file data' },
      { status: 400 },
    );
  }
  const buffer = new Uint8Array(arrayBuffer);

  const { error: uploadError } = await supabase.storage
    .from('uploads')
    .upload(filePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    // Bucket might not exist yet, try to create it
    if (uploadError.message?.includes('not found')) {
      console.warn('QB upload: bucket "uploads" not found, creating...');
      const { error: bucketError } = await supabase.storage.createBucket('uploads', {
        public: true,
      });

      if (bucketError) {
        console.error('QB upload: failed to create bucket:', bucketError.message);
        return NextResponse.json(
          { error: `Storage setup failed: ${bucketError.message}` },
          { status: 500 },
        );
      }

      // Retry upload after bucket creation
      const { error: retryError } = await supabase.storage
        .from('uploads')
        .upload(filePath, buffer, { contentType: file.type, upsert: false });

      if (retryError) {
        console.error('QB upload: retry after bucket creation failed:', retryError.message);
        return NextResponse.json(
          { error: `Storage upload failed after bucket creation: ${retryError.message}` },
          { status: 500 },
        );
      }
    } else {
      console.error('QB upload: storage upload failed:', uploadError.message);
      return NextResponse.json(
        { error: `Storage upload failed: ${uploadError.message}` },
        { status: 500 },
      );
    }
  }

  // --- 7. Get public URL ---
  const { data: urlData } = supabase.storage
    .from('uploads')
    .getPublicUrl(filePath);

  return NextResponse.json({
    url: rewriteStorageUrl(urlData.publicUrl) || urlData.publicUrl,
    path: filePath,
  });
}
