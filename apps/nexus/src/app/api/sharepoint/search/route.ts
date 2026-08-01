import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { verifyMsToken } from '@/lib/ms-verify';
import { isInternalStaff, resolveStaffRole, canRunSession } from '@/lib/staff-capabilities';
import { searchSiteDrive, browseSiteFolder, type SiteDriveItem } from '@/lib/sharepoint';
import { needsPdfRendition } from '@/lib/office-rendition';

/**
 * GET /api/sharepoint/search?q=  (staff)
 * GET /api/sharepoint/search?path=Teaching/Decks
 *
 * The file picker behind "Choose from SharePoint" when attaching reference
 * material to a class. Searches the shared Neram document library, or lists one
 * folder of it when given a path.
 *
 * STAFF ONLY, and the reason is worth stating: this runs app-only, so it reads
 * the library with the application's permissions rather than the caller's. A
 * student reaching it would be able to enumerate a document library they have no
 * account on. The gate here is the only thing standing in the way.
 *
 * Scoped to the configured site rather than personal OneDrive on purpose.
 * Searching a teacher's own OneDrive needs the delegated Files.Read.All scope,
 * which would make every teacher re-consent at next sign-in. A file that lives
 * only in someone's OneDrive can still be attached by pasting its share link.
 */

export const dynamic = 'force-dynamic';

/** Only what a class can actually use. A .zip in the results helps nobody. */
function isAttachable(item: SiteDriveItem): boolean {
  if (item.isFolder) return true;
  const mime = (item.mimeType || '').toLowerCase();
  if (mime === 'application/pdf') return true;
  if (mime.startsWith('image/')) return true;
  return needsPdfRendition(item.mimeType, item.name);
}

export async function GET(request: NextRequest) {
  // Outside the main try: a bad token is a 401, not the 500 a catch-all would
  // turn every missing Authorization header into.
  let msUser: Awaited<ReturnType<typeof verifyMsToken>>;
  try {
    msUser = await verifyMsToken(request.headers.get('Authorization'));
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdminClient() as any;
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type, staff_role, can_teach')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Anyone who can run a session can attach material to one. canRunSession with
    // no tutor id answers "is this person teaching staff at all", which is the
    // right question: the per-class check happens when the resource is saved.
    const staff = isInternalStaff(resolveStaffRole(user)) || canRunSession(user, null);
    if (!staff) {
      return NextResponse.json({ error: 'Only staff can browse SharePoint' }, { status: 403 });
    }

    const params = request.nextUrl.searchParams;
    const q = (params.get('q') || '').trim();
    const path = params.get('path');

    const items = q ? await searchSiteDrive(q) : await browseSiteFolder(path || '');

    return NextResponse.json({
      items: items.filter(isAttachable),
      mode: q ? 'search' : 'browse',
      path: q ? null : path || '',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'SharePoint search failed';
    console.error('[sharepoint/search]', message);
    // The message can carry a Graph body, which may name internal site ids.
    return NextResponse.json(
      { error: 'Could not reach SharePoint. Try again, or paste the file link instead.' },
      { status: 502 },
    );
  }
}
