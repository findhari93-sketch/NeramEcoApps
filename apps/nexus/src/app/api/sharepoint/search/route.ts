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
import { searchAllDriveItems } from '@/lib/graph-search';
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
 * Graph permission and no consent prompt. `scope=both` is what the recording
 * picker uses.
 *
 * `both` NOW PREFERS THE TENANT INDEX, because two drives were never the right
 * two. The file a teacher is looking for is often in a folder a COLLEAGUE shared
 * with them out of their own OneDrive, and that is in neither: not the library,
 * and not /me/drive, which does not follow shares. So the picker's honest answer
 * to "find my recording" was an empty list. lib/graph-search asks the index as
 * the caller instead, which returns everything they are allowed to see wherever
 * it lives. It needs delegated Files.Read.All and therefore a separate consent,
 * so the two-drive search stays underneath as the fallback and the response says
 * through `indexed` and `partial` which one actually answered.
 */

export const dynamic = 'force-dynamic';

type Kind = 'document' | 'video';
type Scope = 'site' | 'mine' | 'both';

/** Where a result came from, so the picker can say so on the row. */
type Source = 'site' | 'mine';

/**
 * Deliberately wider than the five it started as. Every one of these is a real
 * recording format that a teacher may have been handed, and a video the picker
 * refuses to list is a video they end up pasting a link to by hand. `.ts` is left
 * out on purpose: it is a transport stream and also every other file in this
 * repository.
 */
const VIDEO_EXT = /\.(mp4|mkv|mov|webm|m4v|avi|wmv|mpe?g|3gp)$/i;

/**
 * Where the video picker starts browsing.
 *
 * The drive root is the wrong place and was the whole reason this dialog looked
 * broken: it opens in browse mode, the root of the library holds two folders and
 * no files, so "Find the English recording" answered with two folder names and
 * nothing that could be picked. Starting inside the class-videos tree puts the
 * teacher where the recordings actually are.
 */
function videoRoot(): string {
  return (process.env.SHAREPOINT_VIDEO_ROOT || 'nexus/class-videos').replace(/^\/+|\/+$/g, '');
}

/**
 * Only what the caller can actually use. A .zip in the results helps nobody, and
 * a .pptx in a list of recordings helps nobody either.
 *
 * FOLDERS ARE NOT ALWAYS ATTACHABLE, which is the correction here. Returning
 * true for every folder is right while BROWSING, where a folder is the thing you
 * click to go deeper. In a SEARCH it is noise that crowds out the results, and
 * when the query happened to match no files it was worse than noise: the picker
 * showed a list made entirely of folders and its "no video files" hint could
 * never fire, so the screen said nothing at all about why there were no videos.
 */
function isAttachable(item: SiteDriveItem, kind: Kind, searching: boolean): boolean {
  if (item.isFolder) return !searching;
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
    const kind: Kind = params.get('kind') === 'video' ? 'video' : 'document';

    /**
     * A MISSING path means "start wherever this kind should start", which is not
     * the same as an empty one meaning "the drive root". The picker sends no
     * path on first open and an explicit one once the teacher navigates, so the
     * default can live here without taking the root away from them afterwards.
     */
    const requestedPath = params.get('path');
    const path = requestedPath ?? (kind === 'video' ? videoRoot() : '');
    /** What was actually listed, which the fallback below can differ from. */
    let listedPath = path;

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

    /** Set when the tenant-wide index answered, so the picker can say so. */
    let indexed = false;

    if (scope === 'mine' && canReadOwnDrive) {
      items = tag(q ? await searchMyDrive(bearer, q) : await browseMyDriveFolder(path), 'mine');
    } else if (scope === 'both' && canReadOwnDrive && q) {
      /**
       * The tenant index first, the two drives as the fallback.
       *
       * The index is the only one of the three that can see a folder shared out
       * of somebody ELSE's OneDrive, which is where teachers keep the recordings
       * they share with each other, so it is the only one that answers the
       * question they are actually asking. It needs delegated Files.Read.All,
       * which is consented separately, so this cannot simply replace the old
       * path: until that lands the index answers 403 and the two-drive search
       * has to still be there underneath.
       */
      let searched: Array<SiteDriveItem & { source: Source }> | null = null;
      try {
        const indexResult = await searchAllDriveItems(bearer, q, kind);
        // Already tagged per row from each hit's own driveType. Re-tagging them
        // all as one source is exactly the lie this path exists to avoid.
        searched = indexResult.items;
        indexed = true;
        if (indexResult.moreAvailable) {
          partial = 'Showing the closest matches. Add a word to narrow it down.';
        }
      } catch (err) {
        console.warn('[sharepoint/search] index unavailable, falling back', err);
      }

      if (searched) {
        items = searched;
      } else {
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
        else if (mine.status === 'rejected') partial = 'Could not reach your OneDrive, showing the Neram library only.';
        else partial = 'Searching the Neram library and your own OneDrive only. Files shared with you by someone else are not included yet.';

        items = [...siteItems, ...mineItems];
      }
    } else if (q) {
      items = tag(await searchSiteDrive(q), 'site');
      effectiveScope = 'site';
    } else {
      /**
       * The video tree may not exist yet on an environment where nobody has made
       * it. Falling back to the drive root keeps the picker usable rather than
       * handing back a 404 for a default the teacher never chose.
       */
      let listing: SiteDriveItem[];
      try {
        listing = await browseSiteFolder(path);
      } catch (err) {
        if (!path || requestedPath !== null) throw err;
        console.warn(`[sharepoint/search] no ${path} folder, listing the drive root`);
        listing = await browseSiteFolder('');
        // The echoed path has to describe what was ACTUALLY listed, not what was
        // asked for. The picker adopts it as its breadcrumb and builds every
        // subsequent request from it, so echoing the folder that just 404'd
        // would put a lie in the trail and 502 the next click.
        listedPath = '';
      }
      items = tag(listing, 'site');
      effectiveScope = 'site';
    }

    return NextResponse.json({
      items: items.filter((item) => isAttachable(item, kind, !!q)),
      mode: q ? 'search' : 'browse',
      path: q ? null : listedPath,
      kind,
      scope: effectiveScope,
      requestedScope: scope,
      indexed,
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
