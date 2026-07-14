import { NextRequest, NextResponse } from 'next/server';
import { reorderStudyItems } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';

/**
 * POST /api/study-materials/reorder  (staff)
 * Bulk-set sort_order for files and/or folders after a drag-reorder or a Move up / Move down.
 * Body: { files?: {id, sort_order}[], folders?: {id, sort_order}[] }.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const body = await request.json();
    const files = Array.isArray(body?.files) ? body.files : [];
    const folders = Array.isArray(body?.folders) ? body.folders : [];

    const clean = (rows: any[]) =>
      rows
        .filter((r) => r && typeof r.id === 'string' && typeof r.sort_order === 'number')
        .map((r) => ({ id: r.id as string, sort_order: r.sort_order as number }));

    const cleanFiles = clean(files);
    const cleanFolders = clean(folders);

    if (!cleanFiles.length && !cleanFolders.length) {
      return NextResponse.json({ error: 'Nothing to reorder' }, { status: 400 });
    }

    await reorderStudyItems({ files: cleanFiles, folders: cleanFolders });
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to reorder';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
