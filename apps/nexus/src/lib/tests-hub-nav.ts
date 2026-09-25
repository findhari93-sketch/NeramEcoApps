/**
 * Where the tests hub keeps its tab, and where the New test wizard returns to.
 *
 * The hub's tab used to live only in useState, so closing the wizard always
 * landed on Library even when the teacher had started from Conducted. The tab
 * now lives in `?tab=`, New test carries it along as `?from=`, and the wizard's
 * close button sends the teacher back to exactly that screen.
 */

export const HUB_TABS = ['library', 'conducted', 'location', 'students'] as const;
export type HubTab = (typeof HUB_TABS)[number];

export const DEFAULT_HUB_TAB: HubTab = 'library';

export function parseHubTab(raw: string | null | undefined): HubTab {
  return HUB_TABS.find((t) => t === raw) ?? DEFAULT_HUB_TAB;
}

/** Library is the landing tab, so it keeps the bare URL everyone already has bookmarked. */
export function hubHref(tab: HubTab): string {
  return tab === DEFAULT_HUB_TAB ? '/teacher/tests' : `/teacher/tests?tab=${tab}`;
}

/** The wizard's entry URL, remembering which screen it was opened from. */
export function newTestHref(from: HubTab | string, extra?: Record<string, string>): string {
  const params = new URLSearchParams({ from, ...(extra || {}) });
  return `/teacher/tests/new?${params.toString()}`;
}

/**
 * Where the wizard's close button goes.
 *
 * `from` is either a hub tab name or an in-app teacher path (a study material
 * page that opened the wizard). Anything else, including an absolute URL or a
 * protocol-relative `//host`, falls back to the hub, so a crafted link cannot
 * turn the close button into an open redirect.
 */
export function wizardCloseHref(from: string | null | undefined): string {
  if (!from) return hubHref(DEFAULT_HUB_TAB);
  const tab = HUB_TABS.find((t) => t === from);
  if (tab) return hubHref(tab);
  if (from.startsWith('/teacher/') && !from.startsWith('//') && !from.includes('\\') && !from.includes('://')) {
    return from;
  }
  return hubHref(DEFAULT_HUB_TAB);
}

/** A short "From Conducted" style label for the wizard header. Null when there is nothing useful to say. */
export function wizardFromLabel(from: string | null | undefined): string | null {
  switch (from) {
    case 'library':
      return 'From Library';
    case 'conducted':
      return 'From Conducted';
    case 'location':
      return 'From By location';
    case 'students':
      return 'From Student tests';
    default:
      return from && wizardCloseHref(from) === from ? 'From study material' : null;
  }
}
