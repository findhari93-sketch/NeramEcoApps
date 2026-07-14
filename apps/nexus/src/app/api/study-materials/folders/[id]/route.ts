import { NextRequest, NextResponse } from 'next/server';
import { updateFolder, softDeleteFolderTree, getDescendantFolderIds } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';

/**
 * PATCH /api/study-materials/folders/[id]  (staff)
 * Rename, move, retarget audience, or toggle download on a folder.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const body = await request.json();
    const patch: Record<string, unknown> = {};
    if (typeof body.name === 'string') patch.name = body.name.trim();
    if ('description' in body) patch.description = body.description ?? null;
    if ('parent_id' in body) patch.parent_id = body.parent_id ?? null;
    if (Array.isArray(body.target_exams)) patch.target_exams = body.target_exams;
    if (Array.isArray(body.target_programs)) patch.target_programs = body.target_programs;
    if (typeof body.allow_download === 'boolean') patch.allow_download = body.allow_download;
    if (typeof body.sort_order === 'number') patch.sort_order = body.sort_order;

    if ('parent_id' in patch && patch.parent_id) {
      const newParent = patch.parent_id as string;
      if (newParent === params.id) {
        return NextResponse.json({ error: 'A folder cannot be its own parent' }, { status: 400 });
      }
      const descendants = await getDescendantFolderIds(params.id);
      if (descendants.includes(newParent)) {
        return NextResponse.json(
          { error: 'You cannot move a folder into one of its own subfolders' },
          { status: 400 },
        );
      }
    }

    const folder = await updateFolder(params.id, patch as any);
    return NextResponse.json({ folder });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update folder';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * DELETE /api/study-materials/folders/[id]  (staff)
 * Soft-delete the folder and its entire subtree. SharePoint files are left in place
 * (recoverable); only the references are hidden.
 */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    await softDeleteFolderTree(params.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete folder';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
