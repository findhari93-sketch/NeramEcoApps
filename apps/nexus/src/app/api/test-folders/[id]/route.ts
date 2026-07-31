import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { resolveStaffRole } from '@/lib/staff-capabilities';
import { getTestFolderById, moveTestFolder, renameTestFolder, softDeleteTestFolder } from '@neram/database';

/**
 * One folder in the test library.
 *
 * Every method resolves the folder first and checks the caller owns the tree it
 * belongs to. Reading the folder before acting is what stops a student renaming
 * a staff folder by guessing its id.
 */
async function assertCanEdit(
  folderId: string,
  caller: { id: string; user_type: string; staff_role?: string | null; can_teach?: boolean | null },
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const folder = await getTestFolderById(folderId);
  if (!folder) {
    return { ok: false, response: NextResponse.json({ error: 'Folder not found' }, { status: 404 }) };
  }
  const isStaff = resolveStaffRole(caller) !== null;
  if (folder.owner_scope === 'staff') {
    return isStaff
      ? { ok: true }
      : { ok: false, response: NextResponse.json({ error: 'Only staff can change library folders' }, { status: 403 }) };
  }
  // A student folder is editable by its owner only. Staff can read these trees
  // but not reorganise a student's own workspace.
  return folder.owner_id === caller.id
    ? { ok: true }
    : { ok: false, response: NextResponse.json({ error: 'That folder belongs to someone else' }, { status: 403 }) };
}

function folderError(message: string): NextResponse | null {
  switch (message) {
    case 'FOLDER_NOT_FOUND':
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
    case 'FOLDER_NAME_TAKEN':
      return NextResponse.json({ error: 'A folder with that name is already here.' }, { status: 409 });
    case 'FOLDER_TOO_DEEP':
      return NextResponse.json({ error: 'Folders can only go four levels deep.' }, { status: 400 });
    case 'FOLDER_CYCLE':
      return NextResponse.json({ error: 'A folder cannot be moved inside itself.' }, { status: 400 });
    case 'FOLDER_PARENT_NOT_FOUND':
    case 'FOLDER_SCOPE_MISMATCH':
      return NextResponse.json({ error: 'That parent folder is not available.' }, { status: 400 });
    default:
      return null;
  }
}

/** PATCH /api/test-folders/[id]  Body: { name? } and/or { parent_id?: string|null } */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;
    const guard = await assertCanEdit(params.id, access.caller);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    let folder = null;

    if (typeof body?.name === 'string' && body.name.trim()) {
      folder = await renameTestFolder(params.id, body.name);
    }
    // parent_id must be able to carry an explicit null (move to the root), so
    // presence of the key is the signal, not truthiness.
    if (Object.prototype.hasOwnProperty.call(body || {}, 'parent_id')) {
      folder = await moveTestFolder(params.id, typeof body.parent_id === 'string' ? body.parent_id : null);
    }
    if (!folder) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

    return NextResponse.json({ data: folder });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update folder';
    const known = folderError(message);
    if (known) return known;
    console.error('Test folder PATCH error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/test-folders/[id]
 * Soft-deletes the folder and its descendants. Tests are unfiled, never deleted.
 */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;
    const guard = await assertCanEdit(params.id, access.caller);
    if (!guard.ok) return guard.response;

    const result = await softDeleteTestFolder(params.id);
    return NextResponse.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete folder';
    const known = folderError(message);
    if (known) return known;
    console.error('Test folder DELETE error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
