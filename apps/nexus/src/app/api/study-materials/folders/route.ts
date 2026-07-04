import { NextRequest, NextResponse } from 'next/server';
import {
  listChildFolders,
  listFilesInFolder,
  getFolderById,
  getFolderItemCounts,
  getBreadcrumb,
  createFolder,
  isFolderVisibleToStudent,
  effectiveDownloadable,
  fileKind,
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

    const counts = await getFolderItemCounts(childFolders.map((f) => f.id));
    const folders = childFolders.map((f) => ({
      id: f.id,
      parent_id: f.parent_id,
      name: f.name,
      description: f.description,
      sort_order: f.sort_order,
      item_count: counts[f.id] || 0,
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
      files = rawFiles.map((file) => ({
        id: file.id,
        folder_id: file.folder_id,
        title: file.title,
        file_name: file.file_name,
        file_type: file.file_type,
        file_size_bytes: file.file_size_bytes,
        page_count: file.page_count,
        kind: fileKind(file.file_type),
        downloadable: effectiveDownloadable(file, currentFolder),
        sort_order: file.sort_order,
        created_at: file.created_at,
        ...(staff ? { allow_download: file.allow_download } : {}),
      }));
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

    const folder = await createFolder({
      name: body.name.trim(),
      parent_id: body.parent_id ?? null,
      description: body.description ?? null,
      target_exams: Array.isArray(body.target_exams) ? body.target_exams : [],
      target_programs: Array.isArray(body.target_programs) ? body.target_programs : [],
      allow_download: !!body.allow_download,
      created_by: user.id,
    });

    return NextResponse.json({ folder });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create folder';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
