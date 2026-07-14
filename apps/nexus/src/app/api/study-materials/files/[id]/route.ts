import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/ms-verify';
import { deleteFromSharePoint } from '@/lib/sharepoint';
import { getFileById, updateFile, softDeleteFile } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import { extractYouTubeId } from '@/lib/youtube';

/**
 * PATCH /api/study-materials/files/[id]  (staff)
 * Rename, move to another folder, set the per-file download override, or link/clear a class
 * recording. allow_download accepts true | false | null (null = inherit folder).
 * recording accepts a URL string (YouTube is stored as an embeddable id, anything else as a link)
 * or null/'' to remove.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const body = await request.json();
    const patch: Record<string, unknown> = {};
    if (typeof body.title === 'string') patch.title = body.title.trim();
    if (typeof body.folder_id === 'string') patch.folder_id = body.folder_id;
    if ('allow_download' in body) {
      patch.allow_download =
        body.allow_download === null ? null : body.allow_download === true ? true : false;
    }
    if (typeof body.sort_order === 'number') patch.sort_order = body.sort_order;
    if ('recording' in body) {
      const rec = body.recording;
      if (rec == null || (typeof rec === 'string' && !rec.trim())) {
        patch.recording_url = null;
        patch.video_source = null;
        patch.youtube_id = null;
      } else if (typeof rec === 'string') {
        const yt = extractYouTubeId(rec);
        patch.recording_url = rec.trim();
        patch.video_source = yt ? 'youtube' : 'link';
        patch.youtube_id = yt;
      }
    }

    const file = await updateFile(params.id, patch as any);
    return NextResponse.json({ file });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update file';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * DELETE /api/study-materials/files/[id]  (staff)
 * Remove the file from SharePoint, then soft-delete the record.
 */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);
    const token = extractBearerToken(request.headers.get('Authorization'))!;

    const file = await getFileById(params.id);
    if (file?.sharepoint_item_id) {
      await deleteFromSharePoint(token, file.sharepoint_item_id).catch(() => {});
    }
    await softDeleteFile(params.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete file';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
