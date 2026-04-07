export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { applyWatermark } from '@/lib/watermark';

const BUCKET_PHOTOS = 'student-results-photos';
const BUCKET_ORIGINALS = 'student-results-originals';
const BUCKET_WATERMARKED = 'student-results-watermarked';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Ensure a storage bucket exists, creating it if necessary.
 */
async function ensureBucket(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  bucketId: string,
  isPublic: boolean
) {
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some((b) => b.id === bucketId);
  if (!exists) {
    await supabase.storage.createBucket(bucketId, {
      public: isPublic,
      fileSizeLimit: MAX_FILE_SIZE,
      allowedMimeTypes: ALLOWED_MIME_TYPES,
    });
  }
}

/**
 * Generate a unique filename from the original file.
 */
function generateFilePath(file: File, prefix?: string): string {
  const ext = file.name.split('.').pop() || 'jpg';
  const timestamp = Date.now();
  const safeName = file.name
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9\-_]/g, '-')
    .slice(0, 50);
  const pre = prefix ? `${prefix}-` : '';
  return `${pre}${timestamp}-${safeName}.${ext}`;
}

/**
 * POST /api/admin/student-results/upload
 *
 * Upload a student photo or scorecard image.
 *
 * FormData fields:
 *   - file: the image file
 *   - type: 'photo' | 'scorecard'
 *
 * For photos: uploads to public bucket, returns { photo_url }
 * For scorecards: uploads original (private), applies watermark,
 *   uploads watermarked (public), returns { scorecard_url, scorecard_watermarked_url }
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const uploadType = formData.get('type') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!uploadType || !['photo', 'scorecard'].includes(uploadType)) {
      return NextResponse.json(
        { error: 'Invalid type. Must be "photo" or "scorecard"' },
        { status: 400 }
      );
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: JPEG, PNG, WebP' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 5MB' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    if (uploadType === 'photo') {
      // Upload photo to public bucket
      await ensureBucket(supabase, BUCKET_PHOTOS, true);

      const filePath = generateFilePath(file, 'photo');
      const { data, error } = await supabase.storage
        .from(BUCKET_PHOTOS)
        .upload(filePath, uint8Array, {
          contentType: file.type,
          upsert: false,
        });

      if (error) {
        console.error('Photo upload error:', error);
        return NextResponse.json(
          { error: `Upload failed: ${error.message}` },
          { status: 500 }
        );
      }

      const { data: urlData } = supabase.storage
        .from(BUCKET_PHOTOS)
        .getPublicUrl(data.path);

      return NextResponse.json({ photo_url: urlData.publicUrl });
    }

    // Scorecard upload: original (private) + watermarked (public)
    await ensureBucket(supabase, BUCKET_ORIGINALS, false);
    await ensureBucket(supabase, BUCKET_WATERMARKED, true);

    // 1. Upload original to private bucket
    const originalPath = generateFilePath(file, 'original');
    const { data: originalData, error: originalError } = await supabase.storage
      .from(BUCKET_ORIGINALS)
      .upload(originalPath, uint8Array, {
        contentType: file.type,
        upsert: false,
      });

    if (originalError) {
      console.error('Original scorecard upload error:', originalError);
      return NextResponse.json(
        { error: `Original upload failed: ${originalError.message}` },
        { status: 500 }
      );
    }

    // Generate a signed URL for the private original (valid for 1 year)
    const { data: signedUrlData } = await supabase.storage
      .from(BUCKET_ORIGINALS)
      .createSignedUrl(originalData.path, 365 * 24 * 60 * 60);

    const scorecardUrl = signedUrlData?.signedUrl || '';

    // 2. Apply watermark
    const imageBuffer = Buffer.from(arrayBuffer);
    const watermarkedBuffer = await applyWatermark(imageBuffer);

    // 3. Upload watermarked to public bucket
    const watermarkedPath = generateFilePath(file, 'watermarked').replace(/\.[^.]+$/, '.png');
    const { data: watermarkedData, error: watermarkedError } = await supabase.storage
      .from(BUCKET_WATERMARKED)
      .upload(watermarkedPath, watermarkedBuffer, {
        contentType: 'image/png',
        upsert: false,
      });

    if (watermarkedError) {
      console.error('Watermarked upload error:', watermarkedError);
      return NextResponse.json(
        { error: `Watermarked upload failed: ${watermarkedError.message}` },
        { status: 500 }
      );
    }

    const { data: watermarkedUrlData } = supabase.storage
      .from(BUCKET_WATERMARKED)
      .getPublicUrl(watermarkedData.path);

    return NextResponse.json({
      scorecard_url: scorecardUrl,
      scorecard_watermarked_url: watermarkedUrlData.publicUrl,
    });
  } catch (error) {
    console.error('Error uploading student result file:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}
