export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createUserAvatar, getSupabaseAdminClient } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';

/**
 * POST /api/photo-review/upload  (staff)
 *
 * The escape hatch: a teacher uploads a photo ON BEHALF of a student who cannot
 * do it themselves (no camera, no usable file, a device that will not
 * cooperate). Without this, the photo gate has no way out for that student
 * except turning the whole feature off.
 *
 * Sets photo_status directly to 'approved': a teacher uploading a photo has by
 * definition already looked at it, so routing it back through their own review
 * queue would be theatre. The decision is still written to nexus_photo_reviews
 * so the audit trail shows who did it.
 *
 * This also replaces the impersonation-upload path, which /api/profile/avatar
 * now refuses: a teacher acting for a student does it here, on the record.
 */

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB, same as the student route
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export async function POST(request: NextRequest) {
  try {
    const staff = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(staff);

    const formData = await request.formData();
    const studentId = formData.get('studentId');
    const file = formData.get('file') as File | null;

    if (typeof studentId !== 'string' || !studentId) {
      return NextResponse.json({ error: 'studentId is required' }, { status: 400 });
    }
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF' },
        { status: 400 },
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large. Max 5MB' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;

    const { data: student } = await supabase
      .from('users')
      .select('id, is_alumni')
      .eq('id', studentId)
      .maybeSingle();
    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    const filename = `${studentId}/${Date.now()}.jpg`;
    const fileBuffer = await file.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from('profile-pictures')
      .upload(filename, fileBuffer, { contentType: file.type, upsert: false });

    if (uploadError) {
      console.error('photo-review upload error:', uploadError);
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from('profile-pictures').getPublicUrl(filename);
    const publicUrl = urlData.publicUrl;

    // createUserAvatar rotates is_current, inserts the new user_avatars row, and
    // updates users.avatar_url.
    const avatar = await createUserAvatar(studentId, {
      storage_path: publicUrl,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
    });

    const now = new Date().toISOString();
    await supabase
      .from('users')
      .update({
        photo_status: 'approved',
        photo_submitted_at: now,
        photo_reviewed_at: now,
        photo_reviewed_by: staff.id,
        photo_rejection_reason: null,
        photo_avatar_id: avatar.id,
        updated_at: now,
      })
      .eq('id', studentId);

    await supabase.from('nexus_photo_reviews').insert({
      user_id: studentId,
      avatar_id: avatar.id,
      avatar_url: publicUrl,
      decision: 'approved',
      reason: 'Uploaded by staff on the student behalf',
      reviewed_by: staff.id,
    });

    return NextResponse.json({ success: true, url: publicUrl });
  } catch (err) {
    return errorResponse(err, 'Failed to upload photo');
  }
}
