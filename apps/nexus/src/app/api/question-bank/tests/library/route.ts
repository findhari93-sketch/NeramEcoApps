import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccessAnyClassroom } from '@/lib/qb-auth';
import { resolveStaffRole } from '@/lib/staff-capabilities';
import { listLibraryTests } from '@neram/database';
import type { NexusTestKind } from '@neram/database';

const KINDS: NexusTestKind[] = [
  'class_prep',
  'catchup_class',
  'classroom_assigned',
  'practice_pool',
  'student_custom',
  'content_gate',
  'weekly',
  'mock',
  'full',
  'chapter',
];

/**
 * GET /api/question-bank/tests/library
 *
 * The folder-aware test listing behind the Library tab and every TestPicker.
 *
 * Query:
 *   folder=<uuid>     tests in that folder
 *   folder=unfiled    tests with no folder
 *   (folder omitted)  every folder, which is what search wants
 *   search=<text>     title match, independent of folder
 *   kinds=a,b         restrict to these test kinds
 *   scope=student&owner_id=  staff reading a student's own papers
 *   page, page_size
 */
export async function GET(request: NextRequest) {
  try {
    const access = await verifyQBAccessAnyClassroom(request.headers.get('Authorization'));
    if (!access.ok) return access.response;

    const isStaff = resolveStaffRole(access.caller) !== null;
    const params = new URL(request.url).searchParams;

    // Scope comes from the caller. A student reads only their own papers here;
    // the teacher-assigned tests they can take are served by /api/tests, which
    // resolves placements and availability windows.
    let scope: 'staff' | 'student' = 'staff';
    let ownerId: string | null = null;
    if (!isStaff) {
      scope = 'student';
      ownerId = access.caller.id;
    } else if (params.get('scope') === 'student') {
      const requested = params.get('owner_id');
      if (!requested) {
        return NextResponse.json({ error: 'owner_id is required for a student library' }, { status: 400 });
      }
      scope = 'student';
      ownerId = requested;
    }

    const folderParam = params.get('folder');
    const folderId =
      folderParam === null ? undefined : folderParam === 'unfiled' || folderParam === '' ? null : folderParam;

    const kindsParam = (params.get('kinds') || '')
      .split(',')
      .map((k) => k.trim())
      .filter((k): k is NexusTestKind => (KINDS as string[]).includes(k));

    const page = Math.max(Number(params.get('page') || 0), 0);
    const pageSize = Math.min(Math.max(Number(params.get('page_size') || 50), 1), 200);

    const data = await listLibraryTests({
      scope,
      ownerId,
      folderId,
      search: params.get('search') || undefined,
      kinds: kindsParam.length > 0 ? kindsParam : undefined,
      // Staff need their drafts visible; a student picking a paper does not.
      includeUnpublished: isStaff,
      limit: pageSize,
      offset: page * pageSize,
    });

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load the test library';
    console.error('Test library GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
