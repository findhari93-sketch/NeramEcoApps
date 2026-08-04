/**
 * Turning the test-folder tree into paths.
 *
 * The picker needs three things the nested shape does not give it directly: a
 * readable breadcrumb for a folder, the ids of its ancestors so the tree can be
 * opened to reveal it, and its depth so "New folder inside" can be refused
 * before the request rather than after a 400.
 */

/** Structural match for FolderTreeNav's FolderNode, without importing a client component. */
export interface TestFolderLike {
  id: string;
  name: string;
  children: TestFolderLike[];
}

export interface FlatTestFolder {
  id: string;
  name: string;
  /** Names from the root down, ending with this folder. */
  path: string[];
  /** Every ancestor id, root first. Empty for a top level folder. */
  ancestorIds: string[];
  /** The path as one line, which is what a search result and a field show. */
  label: string;
  /** 1 for a top level folder, so it compares directly with the depth cap. */
  depth: number;
}

/**
 * Mirrors MAX_TEST_FOLDER_DEPTH in packages/database. Duplicated on purpose: the
 * button has to know before it calls, and the server still enforces it.
 */
export const MAX_TEST_FOLDER_DEPTH = 4;

/** Depth first, so the flat list reads in the same order the tree does. */
export function flattenTestFolders(nodes: TestFolderLike[]): FlatTestFolder[] {
  const out: FlatTestFolder[] = [];

  const walk = (list: TestFolderLike[], trailNames: string[], trailIds: string[]) => {
    for (const node of list) {
      // A malformed row that lists an ancestor as its own child would spin here,
      // and listing the same folder twice is its own kind of wrong, so the
      // repeat is dropped rather than merely stopped one level down.
      if (trailIds.includes(node.id)) continue;

      const path = [...trailNames, node.name];
      out.push({
        id: node.id,
        name: node.name,
        path,
        ancestorIds: trailIds,
        label: path.join(' > '),
        depth: path.length,
      });
      if (node.children?.length) walk(node.children, path, [...trailIds, node.id]);
    }
  };

  walk(nodes, [], []);
  return out;
}

/** Whether a new folder may be created inside this one. null means the top level. */
export function canNestUnder(folder: { depth: number } | null | undefined): boolean {
  return (folder?.depth ?? 0) < MAX_TEST_FOLDER_DEPTH;
}

/** Folders whose full path contains every word typed, in any order. */
export function searchTestFolders(
  folders: FlatTestFolder[],
  query: string,
  limit = 50,
): FlatTestFolder[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return folders
    .filter((f) => {
      const haystack = f.label.toLowerCase();
      return words.every((w) => haystack.includes(w));
    })
    .slice(0, limit);
}
