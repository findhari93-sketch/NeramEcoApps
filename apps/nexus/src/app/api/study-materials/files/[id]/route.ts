import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/ms-verify';
import { deleteFromSharePoint } from '@/lib/sharepoint';
import {
  getFileById,
  getFolderById,
  updateFile,
  softDeleteFile,
  fileKind,
  fileRecording,
  effectiveDownloadable,
  isNewFile,
  hasPlacedTestForFiles,
  getCommentCounts,
  getStudyVideoSummaryMap,
  getLinkedPapersForFiles,
} from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import { extractYouTubeId } from '@/lib/youtube';

/**
 * GET /api/study-materials/files/[id]  (staff)
 *
 * One chapter's full DTO, staff-shaped, the same fields `folders/route.ts`
 * computes for a whole batch. Needed because the chapter workspace page
 * (`/teacher/study-materials/[fileId]`) is a direct, refreshable route rather
 * than a modal handed an in-memory file object from the grid.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const file = await getFileById(params.id);
    if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });
    const folder = await getFolderById(file.folder_id);
    if (!folder) return NextResponse.json({ error: 'Folder not found' }, { status: 404 });

    const [testSet, commentCounts, videoLanguages, linkedPapers] = await Promise.all([
      hasPlacedTestForFiles([file.id]),
      getCommentCounts([file.id]),
      getStudyVideoSummaryMap([file.id]),
      getLinkedPapersForFiles([file.id]),
    ]);

    return NextResponse.json({
      file: {
        id: file.id,
        folder_id: file.folder_id,
        title: file.title,
        file_name: file.file_name,
        file_type: file.file_type,
        file_size_bytes: file.file_size_bytes,
        page_count: file.page_count,
        kind: fileKind(file.file_type),
        downloadable: effectiveDownloadable(file, folder),
        has_test: testSet.has(file.id),
        recording: fileRecording(file),
        video_languages: videoLanguages.get(file.id)?.languages ?? [],
        sort_order: file.sort_order,
        created_at: file.created_at,
        is_new: isNewFile(file.created_at, Date.now()),
        comment_count: commentCounts[file.id] || 0,
        allow_download: file.allow_download,
        qb_paper: linkedPapers.get(file.id) ?? null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load file';
    return NextResponse.json({ error: message }, { status: message === 'Not authorized' ? 403 : 500 });
  }
}

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
 *
 * A LINKED file (link_url set) is never the app's own copy, it points at
 * something a teacher already owned in OneDrive/SharePoint. Deleting that item
 * would destroy their real file, not just unlink it here, so only an app-owned
 * upload gets deleteFromSharePoint.
 */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);
    const token = extractBearerToken(request.headers.get('Authorization'))!;

    const file = await getFileById(params.id);
    if (file?.sharepoint_item_id && !file.link_url) {
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
