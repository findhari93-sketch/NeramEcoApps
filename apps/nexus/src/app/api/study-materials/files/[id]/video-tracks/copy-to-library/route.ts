import { NextRequest, NextResponse } from 'next/server';
import { getFileById } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import { videoRefFromBody } from '@/lib/track-recording';
import { chapterFolderName, copyFailureMessage, libraryVideoRootSegments } from '@/lib/library-copy';
import { ensureLibraryFolder, readLibraryCopy, startLibraryCopy } from '@/lib/library-copy-graph';
import { openCopyOperation, sealCopyOperation } from '@/lib/library-copy-token';
import {
  isOneDriveItem,
  isVideoItem,
  resolveVideoItem,
  videoItemDto,
  videoItemMessage,
  VideoItemError,
  type ResolvedVideoItem,
} from '@/lib/sharepoint-video';

/**
 * Copy a class recording out of a personal OneDrive into the Neram library.
 *
 *   POST /api/study-materials/files/[id]/video-tracks/copy-to-library   (staff)
 *   Body: { drive_id, item_id } | { url }
 *     200 { status: 'done', item }        a copy was already in the chapter folder
 *     202 { status: 'copying', operation, name, size_bytes, folder_path }
 *     400 { code: NO_LINK | ALREADY_IN_LIBRARY }
 *     422 { code: NOT_A_VIDEO | NOT_FOUND | NO_ACCESS | LINK_NOT_RECOGNISED }
 *     502 { code: RECORDING_UNREACHABLE }
 *
 *   GET  ...?operation=<the sealed operation from the POST>   (staff)
 *     200 { status: 'copying', percent } | { status: 'done', item } | { status: 'failed', code, error }
 *     400 { code: BAD_OPERATION }
 *
 * WHY. Recordings have to live in the shared library (the policy on the tracks
 * routes), and on 2026-09-11 both prod recordings were in teachers' own
 * OneDrives, owned by people who had never used SharePoint. This copies the file
 * with the app's own permission into "<SHAREPOINT_VIDEO_ROOT>/<chapter title>",
 * leaving the original where it is.
 *
 * THE PROGRESS ADDRESS NEVER REACHES THE BROWSER. Graph answers a copy with an
 * address that carries a `tempauth` token, and the one this tenant returned
 * listed allfiles.write among its scopes. The page gets it sealed
 * (lib/library-copy-token.ts) and hands it back; only this route can open it,
 * and it is refused if changed, expired, or not a copy progress address.
 *
 * NOTHING IS ATTACHED HERE. The page attaches the copy through the ordinary
 * track routes, which re-check the library rule. A copy has the original's name
 * and size, so the PATCH reads it as the same recording and keeps its
 * checkpoints and every student's progress.
 *
 * NOTHING IS STORED about a running copy. A lost operation is recovered by
 * pressing Copy again, which finds the finished file in the chapter folder.
 * Every call is short (Graph does the copying), so no long function duration.
 */

const NO_STORE = { 'Cache-Control': 'no-store' };

function graphFailure(err: VideoItemError, message: string) {
  const unreachable = err.code === 'GRAPH_UNAVAILABLE';
  return NextResponse.json(
    { error: message, code: unreachable ? 'RECORDING_UNREACHABLE' : err.code },
    { status: unreachable ? 502 : 422, headers: NO_STORE },
  );
}

function unexpected(err: unknown, fallback: string) {
  const message = err instanceof Error ? err.message : fallback;
  return NextResponse.json({ error: message }, { status: message === 'Not authorized' ? 403 : 500, headers: NO_STORE });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const body = await request.json().catch(() => ({}));
    const ref = videoRefFromBody(body);
    if (!ref) {
      return NextResponse.json({ error: 'Pick a video in SharePoint, or paste its link.', code: 'NO_LINK' }, { status: 400 });
    }

    const file = await getFileById(params.id);
    if (!file) return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });

    let source: ResolvedVideoItem;
    try {
      source = await resolveVideoItem(ref);
    } catch (err) {
      if (err instanceof VideoItemError) return graphFailure(err, videoItemMessage(err.code));
      throw err;
    }

    if (!isVideoItem(source)) {
      return NextResponse.json({ error: videoItemMessage('NOT_A_VIDEO', source), code: 'NOT_A_VIDEO' }, { status: 422 });
    }
    // Only a OneDrive file needs copying. Anything else is already allowed.
    if (!isOneDriveItem(source)) {
      return NextResponse.json(
        {
          error: 'This video is already in a SharePoint library, so it can be used as it is.',
          code: 'ALREADY_IN_LIBRARY',
          item: videoItemDto(source),
        },
        { status: 400 },
      );
    }

    try {
      const dest = await ensureLibraryFolder([
        ...libraryVideoRootSegments(process.env.SHAREPOINT_VIDEO_ROOT),
        chapterFolderName(file.title),
      ]);
      const started = await startLibraryCopy(source, dest);

      if (started.state === 'done') {
        return NextResponse.json({ status: 'done', item: videoItemDto(started.item) }, { headers: NO_STORE });
      }
      return NextResponse.json(
        {
          status: 'copying',
          operation: sealCopyOperation({ monitor: started.monitor, destDriveId: dest.driveId }),
          name: source.name,
          size_bytes: source.sizeBytes,
          folder_path: dest.path,
        },
        { status: 202, headers: NO_STORE },
      );
    } catch (err) {
      if (err instanceof VideoItemError) return graphFailure(err, copyFailureMessage(err.code));
      throw err;
    }
  } catch (err) {
    return unexpected(err, 'Could not copy the video');
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    // Only an operation this route sealed opens, so nothing else can be fetched.
    const operation = openCopyOperation(request.nextUrl.searchParams.get('operation'));
    if (!operation) {
      return NextResponse.json(
        { error: 'That copy could not be found. Press Copy to Neram library again.', code: 'BAD_OPERATION' },
        { status: 400, headers: NO_STORE },
      );
    }

    const progress = await readLibraryCopy(operation.monitor, operation.destDriveId);
    if (progress.state === 'copying') {
      return NextResponse.json({ status: 'copying', percent: progress.percent }, { headers: NO_STORE });
    }
    if (progress.state === 'done') {
      return NextResponse.json({ status: 'done', item: videoItemDto(progress.item) }, { headers: NO_STORE });
    }
    return NextResponse.json(
      { status: 'failed', code: progress.code, error: copyFailureMessage(progress.code) },
      { headers: NO_STORE },
    );
  } catch (err) {
    if (err instanceof VideoItemError) return graphFailure(err, copyFailureMessage(err.code));
    return unexpected(err, 'Could not check the copy');
  }
}
