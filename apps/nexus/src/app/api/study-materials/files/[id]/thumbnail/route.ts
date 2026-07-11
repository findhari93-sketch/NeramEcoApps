import { NextRequest, NextResponse } from 'next/server';
import {
  getFileById,
  getFolderById,
  isFolderVisibleToStudent,
} from '@neram/database';
import { getSharePointThumbnailUrl } from '@/lib/sharepoint';
import { getRequestUser, isStaff, getStudentExamSet } from '@/lib/study-materials';

/**
 * GET /api/study-materials/files/[id]/thumbnail?token=...&size=medium
 *
 * Streams a Microsoft Graph thumbnail (PDF first page / image) through our server so no SharePoint
 * URL is exposed. Returns 204 when Graph has no thumbnail (unsupported, or still generating right
 * after upload) so the client falls back to the file-type glyph.
 *
 * Auth via Authorization header OR ?token= (an <img> cannot set headers). Re-checks audience.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authHeader = request.headers.get('Authorization');
    const queryToken = request.nextUrl.searchParams.get('token');
    const tokenString = authHeader || (queryToken ? `Bearer ${queryToken}` : null);

    const user = await getRequestUser(tokenString);

    const file = await getFileById(params.id);
    if (!file || !file.sharepoint_item_id) {
      return new NextResponse(null, { status: 204 });
    }
    const folder = await getFolderById(file.folder_id);
    if (!folder) return new NextResponse(null, { status: 204 });

    if (!isStaff(user)) {
      const examSet = await getStudentExamSet(user.id);
      if (!isFolderVisibleToStudent(folder, examSet, user.student_program)) {
        return NextResponse.json({ error: 'Not available' }, { status: 403 });
      }
    }

    const sizeParam = request.nextUrl.searchParams.get('size');
    const size = sizeParam === 'small' || sizeParam === 'large' ? sizeParam : 'medium';

    const thumbUrl = await getSharePointThumbnailUrl(file.sharepoint_item_id, size);
    if (!thumbUrl) {
      // No thumbnail (yet). Short cache so a just-uploaded file re-checks soon.
      return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'private, max-age=300' } });
    }

    const upstream = await fetch(thumbUrl, { redirect: 'follow' });
    if (!upstream.ok) {
      return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'private, max-age=300' } });
    }
    const buffer = await upstream.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') || 'image/jpeg',
        'Content-Length': String(buffer.byteLength),
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load thumbnail';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
