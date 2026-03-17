import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { uploadToSharePoint, deleteFromSharePoint } from '@/lib/sharepoint';

async function verifyTeacher(request: NextRequest) {
  const msUser = await verifyMsToken(request.headers.get('Authorization'));
  const supabase = getSupabaseAdminClient() as any;
  const { data: user } = await supabase
    .from('users')
    .select('id, user_type')
    .eq('ms_oid', msUser.oid)
    .single();
  if (!user || (user.user_type !== 'teacher' && user.user_type !== 'admin')) {
    throw new Error('Not authorized');
  }
  return user;
}

// GET: List audio tracks for a chapter
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await verifyTeacher(request);
    const supabase = getSupabaseAdminClient() as any;

    const { data: tracks, error } = await supabase
      .from('nexus_audio_tracks')
      .select('*')
      .eq('chapter_id', params.id)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ tracks: tracks || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load audio tracks';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST: Upload a new audio track
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await verifyTeacher(request);
    const token = extractBearerToken(request.headers.get('Authorization'))!;
    const supabase = getSupabaseAdminClient() as any;
    const chapterId = params.id;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const language = (formData.get('language') as string) || 'en';
    const languageLabel = (formData.get('language_label') as string) || 'English';
    const durationSeconds = formData.get('duration_seconds');

    if (!file) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    const allowedTypes = ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a', 'audio/webm', 'audio/aac', 'audio/ogg'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid audio format. Allowed: MP3, M4A, WAV, WebM, AAC, OGG' },
        { status: 400 }
      );
    }

    if (file.size > 100 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 100 MB)' }, { status: 400 });
    }

    // Check for duplicate language
    const { data: existing } = await supabase
      .from('nexus_audio_tracks')
      .select('id')
      .eq('chapter_id', chapterId)
      .eq('language', language)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: `An audio track for "${languageLabel}" already exists. Delete it first.` },
        { status: 409 }
      );
    }

    const ext = file.name.split('.').pop() || 'mp3';
    const timestamp = Date.now();
    const filePath = `nexus/chapters/${chapterId}/audio/${language}_${timestamp}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const result = await uploadToSharePoint(token, filePath, buffer, file.type);

    // Get next sort_order
    const { data: tracks } = await supabase
      .from('nexus_audio_tracks')
      .select('sort_order')
      .eq('chapter_id', chapterId)
      .order('sort_order', { ascending: false })
      .limit(1);

    const nextOrder = (tracks?.[0]?.sort_order ?? -1) + 1;

    const { data: track, error: insertError } = await supabase
      .from('nexus_audio_tracks')
      .insert({
        chapter_id: chapterId,
        language,
        language_label: languageLabel,
        audio_url: result.sharingUrl,
        audio_storage_path: filePath,
        onedrive_item_id: result.itemId,
        audio_duration_seconds: durationSeconds ? parseInt(String(durationSeconds), 10) : null,
        sort_order: nextOrder,
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({ track });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    console.error('Audio upload error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE: Remove an audio track by track ID (passed as query param)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await verifyTeacher(request);
    const token = extractBearerToken(request.headers.get('Authorization'))!;
    const supabase = getSupabaseAdminClient() as any;

    const { searchParams } = new URL(request.url);
    const trackId = searchParams.get('trackId');

    if (!trackId) {
      return NextResponse.json({ error: 'Missing trackId query param' }, { status: 400 });
    }

    // Verify track belongs to this chapter
    const { data: track } = await supabase
      .from('nexus_audio_tracks')
      .select('id, onedrive_item_id')
      .eq('id', trackId)
      .eq('chapter_id', params.id)
      .single();

    if (!track) {
      return NextResponse.json({ error: 'Track not found' }, { status: 404 });
    }

    // Delete file from SharePoint
    if (track.onedrive_item_id) {
      await deleteFromSharePoint(token, track.onedrive_item_id).catch(() => {});
    }

    // Delete DB row
    const { error } = await supabase
      .from('nexus_audio_tracks')
      .delete()
      .eq('id', trackId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delete failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
