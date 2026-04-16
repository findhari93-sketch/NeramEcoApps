import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const bucket = (formData.get('bucket') as string) || 'drawing-uploads';

    if (!file) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const ext = file.name.split('.').pop() || 'png';
    const timestamp = Date.now();
    const filePath = `${user.id}/${timestamp}.${ext}`;

    // Normalize MIME type for Android edge cases (e.g. image/jpg → image/jpeg)
    let contentType = file.type || 'image/jpeg';
    if (contentType === 'image/jpg') contentType = 'image/jpeg';

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, buffer, {
        contentType,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return NextResponse.json({ url: urlData.publicUrl, path: filePath });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    console.error('Drawing upload error:', message);
    const status = message.includes('Invalid Microsoft token') || message.includes('Authorization') ? 401
      : message.includes('mime') || message.includes('type') ? 415
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
