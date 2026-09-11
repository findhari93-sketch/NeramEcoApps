/**
 * Would this click take the teacher away from the page they have unsaved work on?
 *
 * Only a click that would really replace this page in this tab. A new tab, a
 * download, another site (the browser asks about that itself, through
 * beforeunload), a jump within the page, or a click something else already
 * handled, are all left alone.
 *
 * Pure TypeScript, so the rule can be tested without a browser.
 */

export interface AnchorInfo {
  href: string;
  target?: string | null;
  download?: boolean;
}

export interface ClickInfo {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}

export interface LocationInfo {
  origin: string;
  pathname: string;
  search: string;
  hash: string;
}

export function isGuardedNavigation(anchor: AnchorInfo, click: ClickInfo, location: LocationInfo): boolean {
  if (click.defaultPrevented) return false;
  if (click.button !== 0 || click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return false;
  if (anchor.target && anchor.target !== '_self') return false;
  if (anchor.download) return false;

  let url: URL;
  try {
    // Against the full current address, so "#section" resolves to this page.
    url = new URL(anchor.href, `${location.origin}${location.pathname}${location.search}`);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.origin !== location.origin) return false;
  if (url.pathname === location.pathname && url.search === location.search) return false;
  return true;
}
