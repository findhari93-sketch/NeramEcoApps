/**
 * Rewrites legacy Supabase storage URLs to go through the Cloudflare proxy.
 * Handles old URLs stored in DB records before the proxy was set up.
 */
const LEGACY_SUPABASE_HOSTS = [
  'zdnypksjqnhtiblwdaic.supabase.co',
  'hgxjavrsrvpihqrpezdh.supabase.co',
];

export function rewriteStorageUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  const proxyUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!proxyUrl) return url;

  for (const host of LEGACY_SUPABASE_HOSTS) {
    if (url.includes(host)) {
      return url.replace(`https://${host}`, proxyUrl);
    }
  }

  return url;
}
