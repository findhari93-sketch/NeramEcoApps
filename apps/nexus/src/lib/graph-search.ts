/**
 * One search box that finds every file the signed-in teacher can see.
 *
 * WHY THE PER-DRIVE SEARCH WAS NOT ENOUGH. lib/sharepoint.ts reaches exactly two
 * places: /sites/{siteId}/drive, the one configured library, and /me/drive, the
 * caller's own OneDrive. Neither covers the case teachers actually hit, which is
 * a folder a colleague shared with them out of THEIR OneDrive: it is not in the
 * library, and /me/drive/root/search does not follow shares. So a teacher who
 * could open the file in a browser could not find it in Nexus, and the picker's
 * honest answer was an empty list.
 *
 * The Microsoft Search API queries the tenant index as the caller. It returns
 * whatever that person is allowed to see, wherever it lives: their OneDrive,
 * everything shared with them, every SharePoint site they have access to, and
 * Teams channel files, which are SharePoint underneath. One call, no site ids to
 * configure, no second drive to remember.
 *
 * DELEGATED ONLY, and never app-only. App-only against this endpoint would search
 * the whole tenant with the application's permissions, which is precisely the
 * enumeration the staff gate in front of it exists to prevent. Passing the
 * caller's own token means the index does the authorization for us.
 *
 * PERMISSION. It needs delegated Files.Read.All, which lives in
 * loginScopes.nexusTeacher rather than loginScopes.nexus so students never
 * request it. Until an admin consents in Azure and a teacher signs in again, the
 * call answers 403 and the route falls back to the two-drive search. That is why
 * every failure here is a thrown error and not a swallowed empty list: an empty
 * list would look like "no such file" and the teacher would stop looking.
 */

import { toDriveItem, type SiteDriveItem } from './sharepoint';

const SEARCH_URL = 'https://graph.microsoft.com/v1.0/search/query';

/**
 * The extensions worth asking the index for.
 *
 * KQL `filetype:` rather than a post-filter, so the 25 results that come back are
 * 25 videos instead of 25 rows of which two might be. The route filters again
 * afterwards anyway, because the index is not the only source and its idea of a
 * file type is not ours.
 */
// Kept in step with VIDEO_EXT in api/sharepoint/search: the route filters these
// results again, so a type asked for here and rejected there is a wasted slot in
// the 25, and one accepted there but never asked for here is a file that simply
// never appears.
const VIDEO_FILETYPES = ['mp4', 'mkv', 'mov', 'webm', 'm4v', 'avi', 'wmv', 'mpg', 'mpeg', '3gp'];
const DOCUMENT_FILETYPES = ['pdf', 'pptx', 'ppt', 'docx', 'doc', 'png', 'jpg', 'jpeg'];

export interface GraphSearchResult {
  /**
   * Each row carries where it came from, because the index spans everything and
   * a single label for the whole result set would be a lie: a search that
   * returns one file from the library and one from a colleague's OneDrive has to
   * say so per row, or the chip is worse than no chip.
   */
  items: Array<SiteDriveItem & { source: 'site' | 'mine' }>;
  /** The index has more than was asked for, so the picker can say "keep typing". */
  moreAvailable: boolean;
}

/**
 * Which drive a hit lives on, from the driveType Graph reports on its parent.
 *
 * 'personal' is a OneDrive; 'documentLibrary' and 'business' are SharePoint. An
 * unknown or missing value is treated as SharePoint, which is the safer guess:
 * mislabelling a library file as personal would send a teacher looking for it in
 * the wrong place, and the library is where the recordings are meant to be.
 */
function sourceOf(resource: any): 'site' | 'mine' {
  return resource?.parentReference?.driveType === 'personal' ? 'mine' : 'site';
}

function filetypeClause(kind: 'document' | 'video'): string {
  const types = kind === 'video' ? VIDEO_FILETYPES : DOCUMENT_FILETYPES;
  return `(${types.map((t) => `filetype:${t}`).join(' OR ')})`;
}

/**
 * Search everything the caller can see.
 *
 * `msToken` must be a real delegated Microsoft access token. A test,
 * impersonation or parent token will earn a 401 here, which is why the route
 * checks isGraphBearer before ever calling this.
 */
export async function searchAllDriveItems(
  msToken: string,
  query: string,
  kind: 'document' | 'video',
  size = 25,
): Promise<GraphSearchResult> {
  const q = query.trim();
  if (!q) return { items: [], moreAvailable: false };

  const res = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${msToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        {
          entityTypes: ['driveItem'],
          query: { queryString: `${q} ${filetypeClause(kind)}` },
          from: 0,
          size,
          // Asked for by name so the response carries what toDriveItem reads.
          // Without this the index returns its own summary shape and every row
          // would come back with a null mimeType and no size.
          fields: [
            'id',
            'name',
            'webUrl',
            'size',
            'lastModifiedDateTime',
            'file',
            'folder',
            'parentReference',
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    // Thrown, never softened into an empty result. An empty list reads as "that
    // file does not exist" and stops the teacher looking, when the truth is
    // usually that consent has not been granted yet.
    throw new Error(`Microsoft Search failed: ${res.status} ${err}`);
  }

  const data = await res.json().catch(() => ({}));
  const container = data?.value?.[0]?.hitsContainers?.[0];
  const hits = (container?.hits || []) as Array<{ resource?: any }>;

  return {
    items: hits
      .map((hit) => hit.resource)
      .filter((r) => r && r.id)
      .map((r) => ({ ...toDriveItem(r), source: sourceOf(r) })),
    moreAvailable: !!container?.moreResultsAvailable,
  };
}
