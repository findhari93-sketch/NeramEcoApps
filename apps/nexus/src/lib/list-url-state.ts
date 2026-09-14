/**
 * Read and patch the page's query string without useSearchParams.
 *
 * A shared component that calls useSearchParams forces every page that renders
 * it to bail out of prerendering unless wrapped in Suspense; one such hook in
 * RoleGuard once failed the build on 104 routes while type-check stayed green.
 * Reading window.location after mount and writing with history.replaceState has
 * no such reach, and replaceState keeps Next's router state (history.state).
 *
 * patchQuery touches only the keys it is given, so a screen's own params
 * (tab, placement_id, filter) survive.
 */

export function readSearch(): string {
  return typeof window === 'undefined' ? '' : window.location.search;
}

export function patchQuery(patch: Record<string, string | null>): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  let changed = false;
  for (const [key, value] of Object.entries(patch)) {
    const current = url.searchParams.get(key);
    if (value === null) {
      if (current !== null) {
        url.searchParams.delete(key);
        changed = true;
      }
    } else if (current !== value) {
      url.searchParams.set(key, value);
      changed = true;
    }
  }
  if (changed) window.history.replaceState(window.history.state, '', url.toString());
}
