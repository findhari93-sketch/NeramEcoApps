/**
 * Inspiration images are fetched by the server (thumbnails) and shown to every
 * student, so only public objects in this project's own Supabase storage are
 * accepted. Anything else could make the server fetch an arbitrary address or
 * hotlink an image nobody reviewed.
 *
 * Allowed origins, each followed by /storage/v1/object/public/:
 *   - the origin of NEXT_PUBLIC_SUPABASE_URL (staging's proxy in local dev)
 *   - https://db.neramclasses.com (the production proxy)
 *   - https://<project ref>.supabase.co
 */
const PUBLIC_OBJECT_PATH = '/storage/v1/object/public/';
const PROXY_ORIGIN = 'https://db.neramclasses.com';
const SUPABASE_HOST = /^[a-z0-9]+\.supabase\.co$/;

function originOf(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export function isProjectStorageUrl(url: string, supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL): boolean {
  if (typeof url !== 'string' || url.trim() !== url || url === '') return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;

  const ownOrigin = originOf(supabaseUrl);
  const originAllowed =
    parsed.origin === PROXY_ORIGIN ||
    (ownOrigin !== null && parsed.origin === ownOrigin) ||
    (SUPABASE_HOST.test(parsed.hostname) && parsed.origin === `https://${parsed.hostname}`);
  if (!originAllowed) return false;

  // URL() has already resolved any "..", so a path that climbs out of the
  // public object prefix fails this check.
  return parsed.pathname.startsWith(PUBLIC_OBJECT_PATH);
}
