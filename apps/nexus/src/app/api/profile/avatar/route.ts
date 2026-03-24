export const dynamic = 'force-dynamic';

/**
 * Profile Avatar API for Nexus (Microsoft Auth)
 *
 * POST - Upload avatar to Supabase + sync to Microsoft Teams via Graph API
 * DELETE - Remove current avatar
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import { createUserAvatar, getSupabaseAdminClient } from '@neram/database';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/**
 * POST /api/profile/avatar
 * Upload avatar to Supabase storage + push to Microsoft Graph
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const msUser = await verifyMsToken(authHeader);

    // Look up Supabase user by ms_oid
    const supabase = getSupabaseAdminClient();
    const { data: user, error: userError } = await (supabase
      .from('users') as any)
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Parse form data
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const cropDataStr = formData.get('cropData') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF' },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large. Max 5MB' }, { status: 400 });
    }

    // Parse crop data
    let cropData = null;
    if (cropDataStr) {
      try { cropData = JSON.parse(cropDataStr); } catch { /* ignore */ }
    }

    // Upload to Supabase Storage
    const filename = `${user.id}/${Date.now()}.jpg`;
    const fileBuffer = await file.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from('profile-pictures')
      .upload(filename, fileBuffer, { contentType: file.type, upsert: false });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('profile-pictures')
      .getPublicUrl(filename);

    const publicUrl = urlData.publicUrl;

    // Save avatar record + update users.avatar_url
    const avatar = await createUserAvatar(user.id, {
      storage_path: publicUrl,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      width: 400,
      height: 400,
      crop_data: cropData,
    });

    // Update user avatar_url
    await (supabase.from('users') as any)
      .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
      .eq('id', user.id);

    // Attempt Microsoft Graph photo sync (non-blocking)
    let teamsSynced = false;
    const token = extractBearerToken(authHeader);
    if (token) {
      try {
        const graphRes = await fetch(
          'https://graph.microsoft.com/v1.0/me/photo/$value',
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'image/jpeg',
            },
            body: fileBuffer,
          }
        );
        teamsSynced = graphRes.ok;
        if (!graphRes.ok) {
          console.warn('Graph photo sync failed:', graphRes.status, await graphRes.text().catch(() => ''));
        }
      } catch (err) {
        console.warn('Graph photo sync error:', err);
      }
    }

    return NextResponse.json({
      success: true,
      avatar: { id: avatar.id, url: publicUrl, teamsSynced },
    });
  } catch (error: any) {
    console.error('Avatar upload error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to upload avatar' },
      { status: error.message?.includes('Authorization') ? 401 : 500 }
    );
  }
}

/**
 * DELETE /api/profile/avatar
 * Remove current avatar
 */
export async function DELETE(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const msUser = await verifyMsToken(authHeader);

    const supabase = getSupabaseAdminClient();
    const { data: user } = await (supabase
      .from('users') as any)
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Clear avatar_url
    await (supabase.from('users') as any)
      .update({ avatar_url: null, updated_at: new Date().toISOString() })
      .eq('id', user.id);

    // Mark current avatars as not current
    await (supabase.from('user_avatars') as any)
      .update({ is_current: false })
      .eq('user_id', user.id)
      .eq('is_current', true);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Avatar delete error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to remove avatar' },
      { status: 500 }
    );
  }
}
