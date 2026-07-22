import { NextRequest, NextResponse } from 'next/server';
import {
  getFileById,
  getFolderById,
  isFolderVisibleToStudent,
  effectiveDownloadable,
  hasActiveDownloadGrant,
} from '@neram/database';
import { getSharePointDownloadUrl, getSharePointStreamUrl } from '@/lib/sharepoint';
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

    // Linked files (no uploaded bytes) resolve via the share URL, which works
    // across any site/drive; uploaded files use the single-site item id.
    const downloadUrl = file.link_url
      ? await getSharePointStreamUrl(file.link_url)
      : await getSharePointDownloadUrl(file.sharepoint_item_id as string);
    const upstream = await fetch(downloadUrl, { redirect: 'follow' });
    if (!upstream.ok) {
      return NextResponse.json({ error: 'Could not fetch file' }, { status: 502 });
    }
    const buffer = await upstream.arrayBuffer();

    const safeName = (file.file_name || 'file').replace(/["\\]/g, '');
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': file.file_type || 'application/octet-stream',
        'Content-Length': String(buffer.byteLength),
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
