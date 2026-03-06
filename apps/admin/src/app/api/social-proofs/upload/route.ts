// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

const BUCKET_NAME = 'social-proofs';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/ogg', 'audio/x-m4a', 'audio/m4a'];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_AUDIO_SIZE = 20 * 1024 * 1024; // 20MB

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const fileType = formData.get('type') as string | null; // 'audio' | 'image'

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const isAudio = fileType === 'audio' || ALLOWED_AUDIO_TYPES.includes(file.type);
    const isImage = !isAudio && ALLOWED_IMAGE_TYPES.includes(file.type);

    if (!isAudio && !isImage) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Allowed: images (JPEG, PNG, WebP) and audio (MP3, WAV, M4A, OGG)` },
        { status: 400 }
      );
    }

    const maxSize = isAudio ? MAX_AUDIO_SIZE : MAX_IMAGE_SIZE;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `File too large. Max: ${isAudio ? '20MB' : '5MB'}` },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();

    // Generate unique filename
    const ext = file.name.split('.').pop() || (isAudio ? 'mp3' : 'jpg');
    const folder = isAudio ? 'audio' : 'images';
    const filename = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filename, uint8Array, {
        contentType: file.type,
        upsert: false,
      });

    if (error) {
      console.error('Upload error:', error);
      return NextResponse.json(
        { error: `Upload failed: ${error.message}` },
        { status: 500 }
      );
    }

    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(data.path);

    return NextResponse.json({
      url: urlData.publicUrl,
      path: data.path,
      type: isAudio ? 'audio' : 'image',
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}
