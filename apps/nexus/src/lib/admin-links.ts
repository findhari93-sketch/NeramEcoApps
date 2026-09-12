/**
 * Links from Nexus into the Admin app.
 *
 * Nexus has no Admin address in its environment, but the two apps always run on
 * sibling hosts: nexus and admin, staging-nexus and staging-admin, and ports 3012
 * and 3013 on a laptop. So the address is worked out from wherever Nexus is running.
 * NEXT_PUBLIC_ADMIN_URL, when it is set, wins. Pure, so it is unit tested.
 */

export const PROD_ADMIN_ORIGIN = 'https://admin.neramclasses.com';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
const LOCAL_ADMIN_PORT = '3013';

export function adminOriginFor(nexusOrigin: string | null | undefined, configured?: string | null): string {
  const explicit = (configured || '').trim().replace(/\/+$/, '');
  if (explicit) return explicit;

  let url: URL;
  try {
    url = new URL(nexusOrigin || '');
  } catch {
    return PROD_ADMIN_ORIGIN;
  }

  const host = url.hostname;
  if (LOCAL_HOSTS.has(host)) return `${url.protocol}//${host}:${LOCAL_ADMIN_PORT}`;
  if (host.startsWith('staging-nexus.')) {
    return `${url.protocol}//staging-admin.${host.slice('staging-nexus.'.length)}`;
  }
  if (host.startsWith('nexus.')) return `${url.protocol}//admin.${host.slice('nexus.'.length)}`;
  // A preview deployment has no Admin twin, and production is the safe landing.
  return PROD_ADMIN_ORIGIN;
}

/**
 * The student's page in the Admin CRM. `section` scrolls to a part of that page,
 * e.g. 'application' for the application form.
 */
export function adminCrmUrl(
  userId: string,
  options: { nexusOrigin?: string | null; configured?: string | null; section?: string } = {},
): string {
  const base = adminOriginFor(options.nexusOrigin, options.configured);
  const query = options.section ? `?section=${encodeURIComponent(options.section)}` : '';
  return `${base}/crm/${encodeURIComponent(userId)}${query}`;
}
