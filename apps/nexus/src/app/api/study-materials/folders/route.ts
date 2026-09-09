import { NextRequest, NextResponse } from 'next/server';
import {
  listChildFolders,
  listFilesInFolder,
  getFolderById,
  getFolderItemCounts,
  getFolderUnreadCounts,
  createFolder,
  listAllFolders,
  getNextSortOrder,
  isFolderVisibleToStudent,
  effectiveDownloadable,
  grantCoversFile,
  listActiveGrantsForStudent,
  fileKind,
  fileRecording,
  isNewFile,
  getFileProgressMap,
  deriveFileStatus,
  hasPlacedTestForFiles,
  listFavoriteFileIds,
  getCommentCounts,
  getStudyVideoSummaryMap,
  getLinkedPapersForFiles,
  type FileProgress,
  type LinkedQBPaper,
  type NexusStudyFile,
} from '@neram/database';
import { getRequestUser, isStaff, assertStaff, getStudentExamSet } from '@/lib/study-materials';
import { buildBreadcrumb } from '@/lib/study-breadcrumb';

/**
 * A folder id only ever arrives from the query string. Checking its shape before the
 * fan-out below matters: the queries now start together, so a malformed id would reach
 * listFilesInFolder as well as getFolderById and turn a clean 404 into a Postgres cast
 * error surfacing as a 500.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/study-materials/folders?parent=<id>
 * Browse a folder. Students get an audience-filtered, view-safe payload; staff get everything
 * plus the management fields (targets, raw download flags).
 *
 * Shape note: this route used to await ~14 queries one after another, which from India was
 * most of the 3.6s a student waited on a populated folder. Everything below the caller lookup
 * derives from the folder id and the user id, not from each other, so it now runs in two
 * waves. The audience checks have NOT moved: they still run before anything is placed in the
 * response. The only difference is that on a 403/404 path some rows are fetched and then
 * thrown away, which costs nothing and returns nothing.
 */
export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  let authMs = 0;
  let waveOneMs = 0;
  let waveTwoMs = 0;

  try {
    // ---- Wave 0: who is asking. Everything else depends on this. ----
    const user = await getRequestUser(request.headers.get('Authorization'));
    authMs = Date.now() - startedAt;

    // Flat folder list for the staff "Move to folder..." picker.
    if (request.nextUrl.searchParams.get('all') === '1') {
      assertStaff(user);
      const all = await listAllFolders();
      return NextResponse.json({
        folders: all.map((f) => ({ id: f.id, parent_id: f.parent_id, name: f.name })),
      });
    }

    const parentParam = request.nextUrl.searchParams.get('parent');
    const parentId = parentParam && parentParam !== 'root' ? parentParam : null;
    if (parentId && !UUID_RE.test(parentId)) {
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
    }

    const staff = isStaff(user);
    const studentProgram = user.student_program;

    // ---- Wave 1: independent of one another, so they go together. ----
    const waveOneAt = Date.now();
    const [studentExams, currentFolder, allChildFolders, rawFolderFiles, breadcrumb] =
      await Promise.all([
        staff ? Promise.resolve([] as string[]) : getStudentExamSet(user.id),
        parentId ? getFolderById(parentId) : Promise.resolve(null),
        listChildFolders(parentId),
        parentId ? listFilesInFolder(parentId) : Promise.resolve([] as NexusStudyFile[]),
        buildBreadcrumb(parentId),
      ]);
    waveOneMs = Date.now() - waveOneAt;

    // ---- Audience gate. Unchanged, and still ahead of any response building. ----
    if (parentId && !currentFolder) {
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
    }
    if (
      currentFolder &&
      !staff &&
      !isFolderVisibleToStudent(currentFolder, studentExams, studentProgram)
    ) {
      return NextResponse.json({ error: 'Not available' }, { status: 403 });
    }

    // Child folders, audience-filtered for students.
    const childFolders = staff
      ? allChildFolders
      : allChildFolders.filter((f) => isFolderVisibleToStudent(f, studentExams, studentProgram));

    const childFolderIds = childFolders.map((f) => f.id);

    // Files live inside folders only (root shows folders only).
    const wantsFiles = !!(parentId && currentFolder);
    const rawFiles = wantsFiles ? rawFolderFiles : [];
    const fileIds = rawFiles.map((f) => f.id);

    // ---- Wave 2: everything that needed an id from wave 1. ----
    const waveTwoAt = Date.now();
    const [counts, folderUnread, fileExtras] = await Promise.all([
      getFolderItemCounts(childFolderIds),
      // Unread rollup for the student's own view (direct-child files only).
      staff
        ? Promise.resolve({} as Record<string, number>)
        : getFolderUnreadCounts(user.id, childFolderIds),
      // Per-user + shared computed extras. Students also get their study progress (status + time)
      // and active download grants; teachers see the file's own setting only.
      // One more batched read for the whole folder, not one per card: which
      // languages each chapter is recorded in. getStudyVideoSummaryMap was
      // written for exactly this and had never been called, so a student
      // browsing Foundation Books could not tell a chapter with two recordings
      // from one with none until they opened it.
      wantsFiles
        ? Promise.all([
            staff
              ? Promise.resolve(new Map<string, FileProgress>())
              : getFileProgressMap(user.id, fileIds),
            staff ? Promise.resolve(new Set<string>()) : listFavoriteFileIds(user.id, fileIds),
            getCommentCounts(fileIds),
            staff ? Promise.resolve([]) : listActiveGrantsForStudent(user.id),
            hasPlacedTestForFiles(fileIds),
            // The admin's configured language order is deliberately NOT read here.
            // It would cost a nexus_settings round trip on every folder browse, the
            // hottest path a student has, to decide the order of at most two chips.
            // The built-in fallback covers the languages that exist.
            getStudyVideoSummaryMap(fileIds),
            // Staff only: which of these files is a Question Bank paper's PDF, so
            // "Attach test" can point at the paper's own questions instead of
            // writing a second, disconnected set from the raw file.
            staff
              ? getLinkedPapersForFiles(fileIds)
              : Promise.resolve(new Map<string, LinkedQBPaper>()),
          ] as const)
        : Promise.resolve(null),
    ]);
    waveTwoMs = Date.now() - waveTwoAt;

    const folders = childFolders.map((f) => ({
      id: f.id,
      parent_id: f.parent_id,
      name: f.name,
      description: f.description,
      sort_order: f.sort_order,
      item_count: counts[f.id] || 0,
      ...(staff ? {} : { unread_count: folderUnread[f.id] || 0 }),
      ...(staff
        ? {
            target_exams: f.target_exams,
            target_programs: f.target_programs,
            allow_download: f.allow_download,
          }
        : {}),
    }));

    let files: any[] = [];
    if (wantsFiles && fileExtras) {
      const [progress, favSet, commentCounts, grants, testSet, videoLanguages, linkedPapers] =
        fileExtras;
      const now = Date.now();
      files = rawFiles.map((file) => {
        const p = progress.get(file.id);
        return {
          id: file.id,
          folder_id: file.folder_id,
          title: file.title,
          file_name: file.file_name,
          file_type: file.file_type,
          file_size_bytes: file.file_size_bytes,
          page_count: file.page_count,
          kind: fileKind(file.file_type),
          downloadable:
            effectiveDownloadable(file, currentFolder) || (!staff && grantCoversFile(grants, file)),
          has_test: testSet.has(file.id),
          recording: fileRecording(file),
          // The languages a student can actually watch, each saying whether
          // finishing it unlocks the test. Empty on a chapter with nothing
          // published, which is what lets a card stay silent rather than
          // promising a video that is still a draft.
          video_languages: videoLanguages.get(file.id)?.languages ?? [],
          sort_order: file.sort_order,
          created_at: file.created_at,
          is_new: isNewFile(file.created_at, now),
          comment_count: commentCounts[file.id] || 0,
          ...(staff
            ? {}
            : {
                is_unread: !p,
                is_favorite: favSet.has(file.id),
                status: deriveFileStatus(p),
                active_seconds: p?.active_seconds ?? 0,
                best_score_pct: p?.best_score_pct ?? null,
              }),
          ...(staff
            ? { allow_download: file.allow_download, qb_paper: linkedPapers.get(file.id) ?? null }
            : {}),
        };
      });
    }

    return NextResponse.json(
      {
        folder: currentFolder
          ? {
              id: currentFolder.id,
              parent_id: currentFolder.parent_id,
              name: currentFolder.name,
              description: currentFolder.description,
              sort_order: currentFolder.sort_order,
              item_count: folders.length + files.length,
              ...(staff
                ? {
                    target_exams: currentFolder.target_exams,
                    target_programs: currentFolder.target_programs,
                    allow_download: currentFolder.allow_download,
                  }
                : {}),
            }
          : null,
        breadcrumb,
        folders,
        files,
      },
      {
        headers: {
          // Server time only, so a slow load can be read as "our queries" against "the
          // network between here and the phone" without guessing. Carries no user data.
          'Server-Timing': [
            `auth;dur=${authMs}`,
            `wave1;dur=${waveOneMs}`,
            `wave2;dur=${waveTwoMs}`,
            `total;dur=${Date.now() - startedAt}`,
          ].join(', '),
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load folder';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * POST /api/study-materials/folders  (staff)
 * Create a folder.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const body = await request.json();
    if (!body?.name || typeof body.name !== 'string') {
      return NextResponse.json({ error: 'Folder name is required' }, { status: 400 });
    }

    const parentId = body.parent_id ?? null;
    // Append to the end of its group so a new folder does not jump to the top.
    const sortOrder = await getNextSortOrder({ folders: parentId });

    const folder = await createFolder({
      name: body.name.trim(),
      parent_id: parentId,
      description: body.description ?? null,
      target_exams: Array.isArray(body.target_exams) ? body.target_exams : [],
      target_programs: Array.isArray(body.target_programs) ? body.target_programs : [],
      allow_download: !!body.allow_download,
      sort_order: sortOrder,
      created_by: user.id,
    });

    return NextResponse.json({ folder });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create folder';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
