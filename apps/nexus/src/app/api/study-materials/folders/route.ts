import { NextRequest, NextResponse } from 'next/server';
import {
  listChildFolders,
  listFilesInFolder,
  getFolderById,
  getFolderItemCounts,
  getFolderUnreadCounts,
  getBreadcrumb,
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
  hasTestForFiles,
  listFavoriteFileIds,
  getCommentCounts,
  type FileProgress,
} from '@neram/database';
import { getRequestUser, isStaff, assertStaff, getStudentExamSet } from '@/lib/study-materials';

/**
 * GET /api/study-materials/folders?parent=<id>
 * Browse a folder. Students get an audience-filtered, view-safe payload; staff get everything
 * plus the management fields (targets, raw download flags).
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));

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

    const staff = isStaff(user);
    const studentExams = staff ? [] : await getStudentExamSet(user.id);
    const studentProgram = user.student_program;

    // Resolve the current folder (for breadcrumb + audience check when not root).
    let currentFolder = null;
    if (parentId) {
      currentFolder = await getFolderById(parentId);
      if (!currentFolder) {
        return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
      }
      if (!staff && !isFolderVisibleToStudent(currentFolder, studentExams, studentProgram)) {
        return NextResponse.json({ error: 'Not available' }, { status: 403 });
      }
    }

    // Child folders, audience-filtered for students.
    let childFolders = await listChildFolders(parentId);
    if (!staff) {
      childFolders = childFolders.filter((f) =>
        isFolderVisibleToStudent(f, studentExams, studentProgram),
      );
    }

    const childFolderIds = childFolders.map((f) => f.id);
    const counts = await getFolderItemCounts(childFolderIds);
    // Unread rollup for the student's own view (direct-child files only).
    const folderUnread = staff ? {} : await getFolderUnreadCounts(user.id, childFolderIds);
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

    // Files live inside folders only (root shows folders only).
    let files: any[] = [];
    if (parentId && currentFolder) {
      const rawFiles = await listFilesInFolder(parentId);
      const fileIds = rawFiles.map((f) => f.id);
      // Per-user + shared computed extras. Students also get their study progress (status + time)
      // and active download grants; teachers see the file's own setting only.
      const [progress, favSet, commentCounts, grants, testSet] = await Promise.all([
        staff
          ? Promise.resolve(new Map<string, FileProgress>())
          : getFileProgressMap(user.id, fileIds),
        staff ? Promise.resolve(new Set<string>()) : listFavoriteFileIds(user.id, fileIds),
        getCommentCounts(fileIds),
        staff ? Promise.resolve([]) : listActiveGrantsForStudent(user.id),
        hasTestForFiles(fileIds),
      ]);
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
          ...(staff ? { allow_download: file.allow_download } : {}),
        };
      });
    }

    const breadcrumb = await getBreadcrumb(parentId);

    return NextResponse.json({
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
    });
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
