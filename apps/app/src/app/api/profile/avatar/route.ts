/**
 * Profile Avatar API
 *
 * POST - Upload new avatar with crop data
 * DELETE - Remove current avatar
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import {
  getUserByFirebaseUid,
  createUserAvatar,
  getSupabaseAdminClient,
} from '@neram/database';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.NEXT_PUBLIC_MARKETING_URL || '*',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * POST /api/profile/avatar
 * Upload new avatar with crop data
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const idToken = authHeader?.replace('Bearer ', '');

    if (!idToken) {
      return NextResponse.json(
        { error: 'Authorization required' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Verify the Firebase ID token
    const decodedToken = await verifyIdToken(idToken);

    // Get user from database
    const user = await getUserByFirebaseUid(decodedToken.uid);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    // Get form data
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const cropDataStr = formData.get('cropData') as string | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size: 5MB' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Parse crop data if provided
    let cropData = null;
    if (cropDataStr) {
      try {
        cropData = JSON.parse(cropDataStr);
      } catch (e) {
        console.warn('Invalid crop data JSON:', e);
      }
    }

    // Generate unique filename
    const ext = file.name.split('.').pop() || 'jpg';
    const filename = `${user.id}/${Date.now()}.${ext}`;

    // Upload to Supabase Storage
    const supabase = getSupabaseAdminClient();
    const fileBuffer = await file.arrayBuffer();

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('profile-pictures')
      .upload(filename, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload file' },
        { status: 500, headers: corsHeaders }
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('profile-pictures')
      .getPublicUrl(filename);

    const publicUrl = urlData.publicUrl;

    // Create avatar record in database
    const avatar = await createUserAvatar(user.id, {
      storage_path: publicUrl,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      crop_data: cropData,
    });

    return NextResponse.json(
      {
        success: true,
        avatar: {
          id: avatar.id,
          url: publicUrl,
          crop_data: cropData,
        },
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error uploading avatar:', error);
    return NextResponse.json(
      { error: 'Failed to upload avatar' },
      { status: 500, headers: corsHeaders }
    );
  }
}

/**
 * DELETE /api/profile/avatar
 * Remove current avatar (set to null)
 */
export async function DELETE(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const idToken = authHeader?.replace('Bearer ', '');

    if (!idToken) {
      return NextResponse.json(
        { error: 'Authorization required' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Verify the Firebase ID token
    const decodedToken = await verifyIdToken(idToken);

    // Get user from database
    const user = await getUserByFirebaseUid(decodedToken.uid);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    // Update user to remove avatar_url
    const supabase = getSupabaseAdminClient();

    const { error } = await supabase
      .from('users')
      .update({
        avatar_url: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (error) {
      throw error;
    }

    // Update current avatar to not current
    await supabase
      .from('user_avatars')
      .update({ is_current: false })
      .eq('user_id', user.id)
      .eq('is_current', true);

    return NextResponse.json(
      { success: true },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error removing avatar:', error);
    return NextResponse.json(
      { error: 'Failed to remove avatar' },
      { status: 500, headers: corsHeaders }
    );
  }
}
