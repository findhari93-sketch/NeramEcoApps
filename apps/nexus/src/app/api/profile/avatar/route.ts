export const dynamic = 'force-dynamic';

/**
 * Profile Avatar API for Nexus (Microsoft Auth)
 *
 * POST - Upload avatar to Supabase + sync to Microsoft Teams via Graph API
 * DELETE - Remove current avatar
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
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

    // An impersonation token carries the STUDENT's oid, so without this guard a
    // teacher in "View as Student" could upload a face photo as that student.
    // The audited staff path is POST /api/photo-review/upload instead.
    if (msUser.impersonatorUserId) {
      return NextResponse.json(
        {
          error: 'impersonation_not_allowed',
          message:
            'You cannot upload a photo while viewing as a student. Use Photo Review to upload on their behalf.',
        },
        { status: 403 }
      );
    }

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

    // Update user avatar_url, and put the photo into the teacher review queue.
    // 'pending' deliberately does NOT block: a student who uploads at 11pm must
    // not sit locked out until a teacher wakes up. Any previous rejection is
    // cleared, so re-uploading is always a way back in.
    await (supabase.from('users') as any)
      .update({
        avatar_url: publicUrl,
        photo_status: 'pending',
        photo_submitted_at: new Date().toISOString(),
        photo_avatar_id: avatar.id,
        photo_reviewed_by: null,
        photo_reviewed_at: null,
        photo_rejection_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    // NOTE: the photo is deliberately NOT pushed to Microsoft here.
    //
    // This route used to PUT /me/photo/$value with the student's own token. That
    // could never work: loginScopes.nexus requests User.Read and
    // User.ReadBasic.All, never User.ReadWrite, so Graph returned 403 for every
    // student and the failure was only console.warn'd. It was also wrong in
    // principle, because it published an unreviewed photo to the student's
    // tenant-wide identity before any teacher had looked at it.
    //
    // The push now happens app-only when a teacher approves the photo, in
    // lib/photo-ms-sync.ts.
    return NextResponse.json({
      success: true,
      avatar: { id: avatar.id, url: publicUrl },
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

    // Clear avatar_url and drop back to 'missing'. When the photo gate is on
    // this re-blocks the student, which is correct: they have chosen to have no
    // photo. The profile UI warns them before they get here.
    await (supabase.from('users') as any)
      .update({
        avatar_url: null,
        photo_status: 'missing',
        photo_avatar_id: null,
        photo_reviewed_by: null,
        photo_reviewed_at: null,
        photo_rejection_reason: null,
        updated_at: new Date().toISOString(),
      })
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
