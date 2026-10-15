export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { dashboardErrorResponse, requireCollegeAction, DashboardError } from '@/lib/college-dashboard/auth';
import { MAX_PHOTO_BYTES, PHOTO_BUCKET, PHOTO_TYPES, photoFolder } from '@/lib/college-dashboard/photos';

/**
 * POST /api/college-dashboard/upload (multipart: file)
 * Stores one photo in the college's own folder and returns its URL. The photo
 * is only shown on the public page after staff approve the Photos section.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireCollegeAction(request, 'edit_content');
    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) throw new DashboardError(400, 'Choose a photo to upload.');
    const ext = PHOTO_TYPES[file.type];
    if (!ext) throw new DashboardError(400, 'Upload a JPEG, PNG or WebP photo.');
    if (file.size > MAX_PHOTO_BYTES) throw new DashboardError(400, 'This photo is larger than 8 MB. Please use a smaller one.');

    const db = createAdminClient() as any;
    const path = `${photoFolder(user.college_id)}/${randomUUID()}.${ext}`;
    const { error } = await db.storage
      .from(PHOTO_BUCKET)
      .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, cacheControl: '31536000', upsert: false });
    if (error) throw new DashboardError(500, `Upload failed: ${error.message}`);
    const url = db.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl as string;
    return NextResponse.json({ url });
  } catch (err) {
    return dashboardErrorResponse(err);
  }
}
