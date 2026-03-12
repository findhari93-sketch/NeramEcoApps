import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * POST /api/drawings/upload
 *
 * Upload a drawing image to Supabase storage.
 * Body: FormData with 'file' and 'exercise_id'
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const exerciseId = formData.get('exercise_id') as string | null;

    if (!file || !exerciseId) {
      return NextResponse.json({ error: 'Missing file or exercise_id' }, { status: 400 });
    }

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

    // Generate unique filename
    const ext = file.name.split('.').pop() || 'png';
    const timestamp = Date.now();
    const filePath = `nexus/drawings/${user.id}/${exerciseId}/${timestamp}.${ext}`;

    // Convert to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    // Upload to Supabase storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('uploads')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      // If bucket doesn't exist, try creating it
      if (uploadError.message?.includes('not found')) {
        await supabase.storage.createBucket('uploads', { public: true });
        const { data: retryData, error: retryError } = await supabase.storage
          .from('uploads')
          .upload(filePath, buffer, { contentType: file.type, upsert: false });
        if (retryError) throw retryError;
      } else {
        throw uploadError;
      }
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('uploads')
      .getPublicUrl(filePath);

    return NextResponse.json({
      url: urlData.publicUrl,
      path: filePath,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    console.error('Drawing upload error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
