const LOCALES = new Set(['en', 'ta', 'hi', 'kn', 'ml']);

export function extractCollegeSlug(pageUrl: string | null | undefined): string | null {
  if (!pageUrl || typeof pageUrl !== 'string') return null;

  let pathname: string;
  try {
    const url = new URL(pageUrl, 'https://placeholder.local');
    pathname = url.pathname;
  } catch {
    return null;
  }

  const segments = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  if (segments.length === 0) return null;

  let start = 0;
  if (LOCALES.has(segments[0])) start = 1;

  if (segments.length - start !== 3) return null;
  if (segments[start] !== 'colleges') return null;

  const slug = segments[start + 2];
  if (!slug) return null;
  return slug;
}
