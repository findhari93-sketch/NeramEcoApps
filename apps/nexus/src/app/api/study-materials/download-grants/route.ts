import { NextRequest, NextResponse } from 'next/server';
import {
  createDownloadGrant,
  revokeDownloadGrant,
  listGrantsForFile,
  listGrantsForFolder,
} from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';

/**
 * Teacher/admin management of time-limited student download grants for Study Materials.
 *
 *   GET    ?fileId= | ?folderId=   -> active grants for that target (with grantee name)
 *   POST   { studentId, scope('file'|'folder'|'all'), fileId?, folderId?, durationDays?|expiresAt?, reason? }
 *   DELETE ?id=                    -> revoke a grant
 *
 * Staff only (getRequestUser + assertStaff). Uses the service-role admin client under the hood.
 */

export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const fileId = request.nextUrl.searchParams.get('fileId');
    const folderId = request.nextUrl.searchParams.get('folderId');
    if (fileId) return NextResponse.json({ grants: await listGrantsForFile(fileId) });
    if (folderId) return NextResponse.json({ grants: await listGrantsForFolder(folderId) });
    return NextResponse.json({ error: 'fileId or folderId is required' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load grants';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const body = await request.json();
    const studentId = body?.studentId as string | undefined;
    const scope = body?.scope as 'file' | 'folder' | 'all' | undefined;
    if (!studentId || !scope || !['file', 'folder', 'all'].includes(scope)) {
      return NextResponse.json({ error: 'studentId and a valid scope are required' }, { status: 400 });
    }
    if (scope === 'file' && !body?.fileId) {
      return NextResponse.json({ error: 'fileId is required for a file-scoped grant' }, { status: 400 });
    }
    if (scope === 'folder' && !body?.folderId) {
      return NextResponse.json({ error: 'folderId is required for a folder-scoped grant' }, { status: 400 });
    }

    // Resolve the expiry: an explicit ISO timestamp, or now + durationDays (default 1 day).
    let expiresAt: string;
    if (typeof body?.expiresAt === 'string' && !Number.isNaN(Date.parse(body.expiresAt))) {
      expiresAt = new Date(body.expiresAt).toISOString();
    } else {
      const days = Number(body?.durationDays);
      const safeDays = Number.isFinite(days) && days > 0 && days <= 60 ? days : 1;
      expiresAt = new Date(Date.now() + safeDays * 24 * 60 * 60 * 1000).toISOString();
    }
    if (Date.parse(expiresAt) <= Date.now()) {
      return NextResponse.json({ error: 'Expiry must be in the future' }, { status: 400 });
    }

    const grant = await createDownloadGrant({
      studentId,
      scope,
      fileId: body?.fileId ?? null,
      folderId: body?.folderId ?? null,
      grantedBy: user.id,
      reason: typeof body?.reason === 'string' ? body.reason.trim() || null : null,
      expiresAt,
    });
    return NextResponse.json({ grant: { id: grant.id, expires_at: expiresAt } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create grant';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
    await revokeDownloadGrant(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to revoke grant';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
