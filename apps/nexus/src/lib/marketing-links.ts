/**
 * Links from Nexus out to the public marketing site.
 *
 * Same problem and same answer as admin-links.ts: Nexus has no marketing address in
 * its environment, but the two always run on related hosts. nexus.neramclasses.com
 * sits beside neramclasses.com, staging-nexus beside staging, and on a laptop they
 * are ports 3012 and 3010. NEXT_PUBLIC_MARKETING_URL wins when it is set.
 *
 * Pure, so it is unit tested. This matters more than it looks: the URL it builds is
 * pasted into WhatsApp by a member of staff, and a wrong origin means a student is
 * sent a link that opens nothing.
 */

export const PROD_MARKETING_ORIGIN = 'https://neramclasses.com';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
const LOCAL_MARKETING_PORT = '3010';

export function marketingOriginFor(
  nexusOrigin: string | null | undefined,
  configured?: string | null,
): string {
  const explicit = (configured || '').trim().replace(/\/+$/, '');
  if (explicit) return explicit;

  let url: URL;
  try {
    url = new URL(nexusOrigin || '');
  } catch {
    return PROD_MARKETING_ORIGIN;
  }

  const host = url.hostname;
  if (LOCAL_HOSTS.has(host)) return `${url.protocol}//${host}:${LOCAL_MARKETING_PORT}`;
  if (host.startsWith('staging-nexus.')) {
    return `${url.protocol}//staging.${host.slice('staging-nexus.'.length)}`;
  }
  if (host.startsWith('nexus.')) return `${url.protocol}//${host.slice('nexus.'.length)}`;
  // A preview deployment has no marketing twin, and production is the safe landing.
  return PROD_MARKETING_ORIGIN;
}

/**
 * The page where a student fills in their own application details.
 * Kept short because it is read off a phone screen and typed by hand when the tap
 * does not work: neramclasses.com/s/<token>.
 */
export function studentDetailUrl(
  token: string,
  options: { nexusOrigin?: string | null; configured?: string | null } = {},
): string {
  const base = marketingOriginFor(options.nexusOrigin, options.configured);
  return `${base}/s/${encodeURIComponent(token)}`;
}
