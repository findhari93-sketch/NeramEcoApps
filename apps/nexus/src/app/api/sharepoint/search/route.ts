import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import { isImpersonationToken } from '@/lib/impersonation-token';
import { isParentToken } from '@/lib/parent-token';
import { isInternalStaff, resolveStaffRole, canRunSession } from '@/lib/staff-capabilities';
import {
  searchSiteDrive,
  browseSiteFolder,
  searchMyDrive,
  browseMyDriveFolder,
  type SiteDriveItem,
} from '@/lib/sharepoint';
import { needsPdfRendition } from '@/lib/office-rendition';

/**
 * GET /api/sharepoint/search?q=  (staff)
 * GET /api/sharepoint/search?path=Teaching/Decks
 * GET /api/sharepoint/search?q=chapter3&kind=video&scope=both
 *
 * The file picker behind "Choose from SharePoint" when attaching reference
 * material to a class, and behind "Search SharePoint or OneDrive" when attaching
 * a class recording to a chapter.
 *
 * STAFF ONLY, and the reason is worth stating: the site half runs app-only, so it
 * reads the library with the application's permissions rather than the caller's.
 * A student reaching it would be able to enumerate a document library they have
 * no account on. The gate here is the only thing standing in the way.
 *
 * TWO DRIVES, TWO KINDS OF TOKEN. `scope=site` is app-only against the one
 * configured site. `scope=mine` is DELEGATED against the caller's own OneDrive,
 * forwarding the bearer they already sent: /me/drive is satisfied by
 * Files.ReadWrite, which is already in loginScopes.nexus, so this needs no new
 * Graph permission and no consent prompt. `scope=both` runs the two together and
 * labels each result, which is what the recording picker uses.
 */

export const dynamic = 'force-dynamic';

type Kind = 'document' | 'video';
type Scope = 'site' | 'mine' | 'both';

/** Where a result came from, so the picker can say so on the row. */
type Source = 'site' | 'mine';

const VIDEO_EXT = /\.(mp4|mkv|mov|webm|m4v)$/i;

/**
 * Only what the caller can actually use. A .zip in the results helps nobody, and
 * a .pptx in a list of recordings helps nobody either.
 */
function isAttachable(item: SiteDriveItem, kind: Kind): boolean {
  if (item.isFolder) return true;
  const mime = (item.mimeType || '').toLowerCase();

  if (kind === 'video') {
    // Extension as well as mime: SharePoint hands back an empty or generic
    // mimeType often enough that filtering on it alone hides real recordings.
    return mime.startsWith('video/') || VIDEO_EXT.test(item.name);
  }

  if (mime === 'application/pdf') return true;
  if (mime.startsWith('image/')) return true;
  return needsPdfRendition(item.mimeType, item.name);
}

/**
 * Can this bearer be forwarded to Graph as the caller?
 *
 * Test, impersonation and parent tokens all resolve to a real user through
 * verifyMsToken, but none of them IS a Microsoft access token, so handing one to
 * /me/drive would earn a 401. Those callers simply get the site half, which is
 * the correct degradation rather than an error: an impersonated session has no
 * "own OneDrive" worth searching in the first place.
 */
function isGraphBearer(token: string | null): token is string {
  if (!token) return false;
  if (token.startsWith('test_')) return false;
  return !isImpersonationToken(token) && !isParentToken(token);
}

function tag(items: SiteDriveItem[], source: Source) {
  return items.map((item) => ({ ...item, source }));
}

export async function GET(request: NextRequest) {
  // Outside the main try: a bad token is a 401, not the 500 a catch-all would
  // turn every missing Authorization header into.
  const authHeader = request.headers.get('Authorization');
  let msUser: Awaited<ReturnType<typeof verifyMsToken>>;
  try {
    msUser = await verifyMsToken(authHeader);
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
    const kind: Kind = params.get('kind') === 'video' ? 'video' : 'document';

    const requested = params.get('scope');
    const scope: Scope =
      requested === 'mine' ? 'mine' : requested === 'both' ? 'both' : 'site';

    const bearer = extractBearerToken(authHeader);
    // Falling back to the site alone keeps a test or impersonated session working
    // instead of 401ing it on a Graph call it was never going to survive.
    const canReadOwnDrive = isGraphBearer(bearer);

    let items: Array<SiteDriveItem & { source: Source }>;
    /** Set when one half of a `both` search failed and the other did not. */
    let partial: string | null = null;
    /**
     * What was actually read, which is not always what was asked for: a browse
     * cannot span two drives, and a non-Graph bearer cannot reach /me at all.
     * Echoed rather than the request so that "why is my OneDrive file missing"
     * is answerable from the response instead of by reading this file.
     */
    let effectiveScope: Scope = scope;

    if (scope === 'mine' && canReadOwnDrive) {
      items = tag(q ? await searchMyDrive(bearer, q) : await browseMyDriveFolder(path || ''), 'mine');
    } else if (scope === 'both' && canReadOwnDrive && q) {
      // Search only. A browse path names a folder in ONE drive, so there is no
      // sensible way to walk both at once.
      const [site, mine] = await Promise.allSettled([searchSiteDrive(q), searchMyDrive(bearer, q)]);

      const siteItems = site.status === 'fulfilled' ? tag(site.value, 'site') : [];
      const mineItems = mine.status === 'fulfilled' ? tag(mine.value, 'mine') : [];

      // One side failing must not fail the request. A teacher whose OneDrive is
      // empty or unreachable still gets the library, and is told which half is
      // missing rather than left wondering why their file is not listed.
      if (site.status === 'rejected' && mine.status === 'rejected') {
        throw site.reason instanceof Error ? site.reason : new Error('Both drives failed');
      }
      if (site.status === 'rejected') partial = 'Could not reach the Neram library, showing your OneDrive only.';
      if (mine.status === 'rejected') partial = 'Could not reach your OneDrive, showing the Neram library only.';

      items = [...siteItems, ...mineItems];
    } else {
      items = tag(q ? await searchSiteDrive(q) : await browseSiteFolder(path || ''), 'site');
      effectiveScope = 'site';
    }

    return NextResponse.json({
      items: items.filter((item) => isAttachable(item, kind)),
      mode: q ? 'search' : 'browse',
      path: q ? null : path || '',
      kind,
      scope: effectiveScope,
      requestedScope: scope,
      partial,
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
