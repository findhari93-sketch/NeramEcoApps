import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { resolveStaffRole } from '@/lib/staff-capabilities';
import { createTestFolder, listTestFolderTree, moveTestsToFolder } from '@neram/database';
import type { NexusTestFolderScope } from '@neram/database';

/**
 * Test library folders.
 *
 * Two trees live in one table: the shared staff library and one private tree
 * per student. Scope is resolved from the CALLER, never trusted from the query
 * string alone, so a student cannot ask for the staff tree and a teacher has to
 * name the student whose tree they want to read.
 */
function resolveScope(
  caller: { id: string; user_type: string },
  isStaff: boolean,
  params: URLSearchParams,
): { scope: NexusTestFolderScope; ownerId: string | null } | null {
  const requested = params.get('scope');

  if (!isStaff) {
    // A student only ever gets their own tree, whatever they asked for.
    return { scope: 'student', ownerId: caller.id };
  }
  if (requested === 'student') {
    // Staff reading a student's tree (the Student tests view) must name them.
    const ownerId = params.get('owner_id');
    return ownerId ? { scope: 'student', ownerId } : null;
  }
  return { scope: 'staff', ownerId: null };
}

/**
 * GET /api/test-folders?scope=staff|student&owner_id=
 * The folder tree plus per-folder test counts and the Unfiled count.
 */
export async function GET(request: NextRequest) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;

    const isStaff = resolveStaffRole(access.caller) !== null;
    const ref = resolveScope(access.caller, isStaff, new URL(request.url).searchParams);
    if (!ref) return NextResponse.json({ error: 'owner_id is required for a student tree' }, { status: 400 });

    const data = await listTestFolderTree(ref);
    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load folders';
    console.error('Test folders GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/test-folders
 * Body: { name, parent_id?, description?, scope? }
 * Students create in their own tree, staff in the shared one.
 */
export async function POST(request: NextRequest) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;

    const isStaff = resolveStaffRole(access.caller) !== null;
    const body = await request.json();
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

    // A student always writes into their own tree. Staff always into the shared
    // one: a teacher does not get to plant folders inside a student's library.
    const ref = isStaff
      ? { scope: 'staff' as NexusTestFolderScope, ownerId: null }
      : { scope: 'student' as NexusTestFolderScope, ownerId: access.caller.id };

    const folder = await createTestFolder({
      ...ref,
      name,
      parentId: typeof body?.parent_id === 'string' ? body.parent_id : null,
      description: typeof body?.description === 'string' ? body.description : null,
      createdBy: access.caller.id,
    });

    return NextResponse.json({ data: folder }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create folder';
    if (message === 'FOLDER_NAME_TAKEN') {
      return NextResponse.json({ error: 'A folder with that name is already here.' }, { status: 409 });
    }
    if (message === 'FOLDER_TOO_DEEP') {
      return NextResponse.json({ error: 'Folders can only go four levels deep.' }, { status: 400 });
    }
    if (message === 'FOLDER_PARENT_NOT_FOUND' || message === 'FOLDER_SCOPE_MISMATCH') {
      return NextResponse.json({ error: 'That parent folder is not available.' }, { status: 400 });
    }
    console.error('Test folders POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/test-folders
 * Body: { test_ids: string[], folder_id: string | null }
 * File tests into a folder, or unfile them with a null folder_id.
 */
export async function PATCH(request: NextRequest) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;

    const body = await request.json();
    const testIds = Array.isArray(body?.test_ids)
      ? body.test_ids.filter((id: unknown) => typeof id === 'string')
      : [];
    if (testIds.length === 0) {
      return NextResponse.json({ error: 'test_ids must be a non-empty array' }, { status: 400 });
    }
    const folderId = typeof body?.folder_id === 'string' ? body.folder_id : null;

    // A student may only re-file their OWN papers. Without this a student could
    // move a teacher's assigned test into a private folder and take it off the
    // library for everyone.
    if (resolveStaffRole(access.caller) === null) {
      const { getSupabaseAdminClient } = await import('@neram/database');
      const supabase = getSupabaseAdminClient();
      const { data: owned } = await supabase
        .from('nexus_tests')
        .select('id')
        .in('id', testIds)
        .eq('created_by_student', access.caller.id);
      const ownedIds = new Set((owned || []).map((t: { id: string }) => t.id));
      if (testIds.some((id: string) => !ownedIds.has(id))) {
        return NextResponse.json({ error: 'You can only move your own tests' }, { status: 403 });
      }
    }

    const moved = await moveTestsToFolder(testIds, folderId);
    return NextResponse.json({ data: { moved } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to move tests';
    if (message === 'FOLDER_NOT_FOUND') {
      return NextResponse.json({ error: 'That folder no longer exists.' }, { status: 400 });
    }
    console.error('Test folders PATCH error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
