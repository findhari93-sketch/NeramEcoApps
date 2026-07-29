import type { NexusQBTagNode } from '@neram/database';

/**
 * Helpers for the two-level Category filter in the question bank.
 *
 * The canonical filter selection is kept COLLAPSED: when every child of
 * Coordinate Geometry is chosen, state holds the single slug
 * `coordinate_geometry`, not its eight children. That is what makes the active
 * filter read as one chip, keeps shareable URLs short, lets a saved preset
 * follow future child additions, and lets deserializeFilters run before the tag
 * tree has loaded.
 *
 * Expansion into leaf slugs happens once, at the network boundary, via
 * expandCategories. The server repeats it defensively (expandQBCategorySlugs)
 * so a hand-typed ?cat=coordinate_geometry is also correct.
 *
 * Everything here is pure: no React, no MUI, so it is directly unit testable.
 */

/** Depth-first flatten, parents before their children. */
export function flattenTagTree(tree: NexusQBTagNode[]): NexusQBTagNode[] {
  const out: NexusQBTagNode[] = [];
  const walk = (nodes: NexusQBTagNode[]) => {
    for (const n of nodes) {
      out.push(n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(tree);
  return out;
}

/** slug -> all descendant slugs (exclusive of the key itself). */
export function buildSlugChildMap(tree: NexusQBTagNode[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const walk = (node: NexusQBTagNode): string[] => {
    const acc: string[] = [];
    for (const child of node.children || []) {
      acc.push(child.slug, ...walk(child));
    }
    map.set(node.slug, acc);
    return acc;
  };
  for (const root of tree) walk(root);
  return map;
}

/**
 * Expand a collapsed selection into the leaf slugs actually stored on questions.
 *
 * Idempotent: expandCategories(expandCategories(x)) === expandCategories(x).
 * Unknown slugs pass through untouched, so off-vocabulary categories and any
 * slug added to the registry after this bundle shipped keep working.
 */
export function expandCategories(selected: string[], tree: NexusQBTagNode[]): string[] {
  if (!selected?.length) return [];
  const childMap = buildSlugChildMap(tree);
  const out = new Set<string>();
  for (const slug of selected) {
    out.add(slug);
    for (const child of childMap.get(slug) || []) out.add(child);
  }
  return [...out];
}

/**
 * slug -> display label for every node in the tree, parents included.
 *
 * Needed because parent slugs deliberately are not members of QBCategory, so
 * QB_CATEGORY_LABELS cannot resolve them and a chip would read
 * "coordinate_geometry".
 */
export function categoryLabelMap(tree: NexusQBTagNode[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const node of flattenTagTree(tree)) out[node.slug] = node.label;
  return out;
}

export type CategorySelectionState = 'checked' | 'indeterminate' | 'unchecked';

/**
 * Tri-state for a node given a collapsed selection.
 *
 * A node is checked when:
 *  - its own slug is selected, or
 *  - an ANCESTOR's slug is selected, because the collapsed form means "this
 *    parent and everything under it". Without the ancestor check a student who
 *    ticks Coordinate Geometry and then expands it sees eight unticked children,
 *    which reads as though the tick did nothing.
 *  - every one of its children is individually selected (the moment before the
 *    selection collapses to the parent).
 *
 * `tree` is optional only so existing callers keep compiling; pass it whenever
 * the node might sit under a collapsed parent.
 */
export function nodeSelectionState(
  node: NexusQBTagNode,
  selected: string[],
  tree?: NexusQBTagNode[],
): CategorySelectionState {
  const set = new Set(selected);
  if (set.has(node.slug)) return 'checked';

  if (tree) {
    for (const ancestor of ancestorsOf(node.slug, tree)) {
      if (set.has(ancestor.slug)) return 'checked';
    }
  }

  const children = node.children || [];
  if (children.length === 0) return 'unchecked';

  const descendants = flattenTagTree(children).map((n) => n.slug);
  const hit = descendants.filter((s) => set.has(s));
  if (hit.length === 0) return 'unchecked';
  if (children.every((c) => set.has(c.slug))) return 'checked';
  return 'indeterminate';
}

/**
 * Toggle one node, returning a new collapsed selection.
 *
 * The four cases:
 *  - parent ON     -> drop any of its children, add the parent slug
 *  - parent OFF    -> remove the parent slug and every descendant
 *  - child OFF while the parent slug is selected -> that parent can no longer
 *    be expressed collapsed, so replace it with its other children ("drill in")
 *  - child ON that completes the set -> collapse back to the parent slug
 */
export function toggleCategoryNode(
  node: NexusQBTagNode,
  selected: string[],
  checked: boolean,
  tree: NexusQBTagNode[],
): string[] {
  const next = new Set(selected);
  const descendants = flattenTagTree(node.children || []).map((n) => n.slug);

  if (checked) {
    for (const slug of descendants) next.delete(slug);
    next.add(node.slug);
  } else {
    next.delete(node.slug);
    for (const slug of descendants) next.delete(slug);

    // If an ancestor was selected in collapsed form, expand it into its other
    // children so unticking one child does not silently drop the whole branch.
    for (const ancestor of ancestorsOf(node.slug, tree)) {
      if (!next.has(ancestor.slug)) continue;
      next.delete(ancestor.slug);
      for (const child of ancestor.children || []) {
        if (child.slug !== node.slug && !descendants.includes(child.slug)) {
          next.add(child.slug);
        }
      }
    }
  }

  return collapseCategories([...next], tree);
}

/**
 * Collapse any fully-selected parent into its own slug.
 *
 * Applied bottom-up so a grandparent collapses only after its children have.
 */
export function collapseCategories(selected: string[], tree: NexusQBTagNode[]): string[] {
  const set = new Set(selected);
  const nodes = flattenTagTree(tree).filter((n) => (n.children?.length || 0) > 0);

  // Deepest first, so children collapse before their parent is considered.
  const depth = nodeDepths(tree);
  nodes.sort((a, b) => (depth.get(b.slug) || 0) - (depth.get(a.slug) || 0));

  for (const node of nodes) {
    const children = node.children || [];
    if (children.length > 0 && children.every((c) => set.has(c.slug))) {
      for (const c of children) set.delete(c.slug);
      set.add(node.slug);
    }
  }
  return [...set];
}

/** Ancestor chain of a slug, nearest first. */
export function ancestorsOf(slug: string, tree: NexusQBTagNode[]): NexusQBTagNode[] {
  const chain: NexusQBTagNode[] = [];
  const find = (nodes: NexusQBTagNode[], trail: NexusQBTagNode[]): boolean => {
    for (const n of nodes) {
      if (n.slug === slug) {
        chain.push(...[...trail].reverse());
        return true;
      }
      if (n.children?.length && find(n.children, [...trail, n])) return true;
    }
    return false;
  };
  find(tree, []);
  return chain;
}

function nodeDepths(tree: NexusQBTagNode[]): Map<string, number> {
  const depths = new Map<string, number>();
  const walk = (nodes: NexusQBTagNode[], d: number) => {
    for (const n of nodes) {
      depths.set(n.slug, d);
      if (n.children?.length) walk(n.children, d + 1);
    }
  };
  walk(tree, 0);
  return depths;
}
