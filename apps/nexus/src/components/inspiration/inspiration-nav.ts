import { pickBackHref } from '@/lib/inspiration-query';

export type InspirationMode = 'student' | 'staff';

const LIST_KEY = 'inspiration:list';

export function inspirationBase(mode: InspirationMode): string {
  return mode === 'staff' ? '/teacher/inspiration' : '/student/inspiration';
}

/** Called as a tile is opened, so Back returns to these exact results. */
export function rememberListUrl(): void {
  try {
    sessionStorage.setItem(LIST_KEY, `${window.location.pathname}${window.location.search}`);
  } catch {
    // Private mode: Back falls back to the Inspiration home.
  }
}

export function backHrefFor(mode: InspirationMode): string {
  const base = inspirationBase(mode);
  try {
    return pickBackHref(sessionStorage.getItem(LIST_KEY), base);
  } catch {
    return base;
  }
}
