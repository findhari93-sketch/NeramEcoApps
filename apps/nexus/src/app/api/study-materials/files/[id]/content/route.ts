import { NextRequest, NextResponse } from 'next/server';
import {
  getFileById,
  getFolderById,
  isFolderVisibleToStudent,
  effectiveDownloadable,
  hasActiveDownloadGrant,
} from '@neram/database';
import {
  getSharePointDownloadUrl,
  getSharePointStreamUrl,
  getSharePointPdfRendition,
} from '@/lib/sharepoint';
import { needsPdfRendition } from '@/lib/office-rendition';
import { getRequestUser, isStaff, getStudentExamSet } from '@/lib/study-materials';

/**
 * GET /api/study-materials/files/[id]/content?token=...&download=0|1
 *
 * View-only proxy: streams the file bytes from SharePoint through our server so the SharePoint URL
 * is never exposed to the client. Served inline (for in-app PDF/image viewing) unless ?download=1
 * AND the file's effective permission allows download, in which case it is sent as an attachment.
 *
 * Auth: Bearer token in the Authorization header, OR ?token= (needed because pdf.js / <img> cannot
 * set custom headers). Re-checks the student's audience before serving.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authHeader = request.headers.get('Authorization');
    const queryToken = request.nextUrl.searchParams.get('token');
    const tokenString = authHeader || (queryToken ? `Bearer ${queryToken}` : null);

    const user = await getRequestUser(tokenString);

    const file = await getFileById(params.id);
    // A file is streamable if it has uploaded bytes (sharepoint_item_id) OR is an
    // external link (link_url, e.g. a pasted OneDrive/SharePoint document).
    if (!file || (!file.sharepoint_item_id && !file.link_url)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    const folder = await getFolderById(file.folder_id);
    if (!folder) {
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
    }

    const staff = isStaff(user);
    if (!staff) {
      const studentExams = await getStudentExamSet(user.id);
      if (!isFolderVisibleToStudent(folder, studentExams, user.student_program)) {
        return NextResponse.json({ error: 'Not available' }, { status: 403 });
      }
    }

    // Staff always; else the file/folder's own setting, else an active time-limited grant for
    // this student (a teacher-issued printout window).
    const granted = !staff && (await hasActiveDownloadGrant(user.id, file));
    const downloadable = staff || effectiveDownloadable(file, folder) || granted;
    const wantDownload = request.nextUrl.searchParams.get('download') === '1' && downloadable;

    // A PowerPoint or Word file cannot be shown by the reader, and handing the
    // real bytes to the browser would just download it, defeating the watermark
    // and the download block. Graph renders it as PDF instead, and everything
    // downstream carries on unchanged.
    //
    // Only for VIEWING. A permitted download gets the real file, because a
    // teacher who is allowed to save the deck wants the deck, not a flattened
    // copy of it.
    const convert = !wantDownload && needsPdfRendition(file.file_type, file.file_name);

    let servedType = file.file_type || 'application/octet-stream';
    let downloadUrl: string | null = null;

    if (convert) {
      downloadUrl = await getSharePointPdfRendition({
        itemId: file.sharepoint_item_id,
        shareUrl: file.link_url,
      });
      if (!downloadUrl) {
        // Graph refuses past its size limit and for formats it cannot render.
        // Say so plainly: the card offers "Open in SharePoint", and that is a far
        // better outcome than a viewer that spins forever.
        return NextResponse.json(
          {
            error:
              'This file cannot be shown in the app. Open it in SharePoint instead.',
            code: 'RENDITION_UNAVAILABLE',
          },
          { status: 415 },
        );
      }
      servedType = 'application/pdf';
    } else {
      // Linked files (no uploaded bytes) resolve via the share URL, which works
      // across any site/drive; uploaded files use the single-site item id.
      downloadUrl = file.link_url
        ? await getSharePointStreamUrl(file.link_url)
        : await getSharePointDownloadUrl(file.sharepoint_item_id as string);
    }

    const upstream = await fetch(downloadUrl, { redirect: 'follow' });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: 'Could not fetch file' }, { status: 502 });
    }

    // Streamed, not buffered. This used to be `await upstream.arrayBuffer()`,
    // which held the whole document in function memory for the life of the
    // invocation: a 20 MB chapter cost 20 MB of provisioned memory for every
    // student who opened it. Passing the body through keeps memory flat
    // regardless of file size. Same approach as api/media/recording.
    const safeName = (file.file_name || 'file').replace(/["\\]/g, '');
    const upstreamLength = upstream.headers.get('content-length');
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': servedType,
        // Only forwarded when the source declared it: computing it ourselves
        // would mean buffering, which is the thing being removed.
        ...(upstreamLength ? { 'Content-Length': upstreamLength } : {}),
        // private: authenticated study material must never enter a shared cache.
        'Cache-Control': 'private, max-age=3600',
        'Content-Disposition': wantDownload ? `attachment; filename="${safeName}"` : 'inline',
      },
    });
  } catch (err) {
    // Log the real error server-side for debugging, but never leak internal
    // resolver messages to the student — this URL opens directly in a new tab.
    console.error('[study-materials/content] failed to stream file:', err);
    return NextResponse.json(
      { error: "This file can't be opened right now. Please report it so we can fix it." },
      { status: 500 },
    );
  }
}
