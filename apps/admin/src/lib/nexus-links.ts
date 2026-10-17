/**
 * Where Nexus lives, as seen from Admin.
 *
 * The mirror of adminOriginFor in apps/nexus/src/lib/admin-links.ts: the two apps
 * run on sibling hosts (admin and nexus, staging-admin and staging-nexus, ports
 * 3013 and 3012 on a laptop), so the Nexus origin is worked out from the one Admin
 * is served from. NEXT_PUBLIC_NEXUS_URL, when it is set, wins. Pure, so it is
 * unit tested: Admin calls Nexus's internal routes at this address, and a wrong
 * origin means "Send to student to check" quietly never sends.
 */

export const PROD_NEXUS_ORIGIN = 'https://nexus.neramclasses.com';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
const LOCAL_NEXUS_PORT = '3012';

export function nexusOriginFor(adminOrigin: string | null | undefined, configured?: string | null): string {
  const explicit = (configured || '').trim().replace(/\/+$/, '');
  if (explicit) return explicit;

  let url: URL;
  try {
    url = new URL(adminOrigin || '');
  } catch {
    return PROD_NEXUS_ORIGIN;
  }

  const host = url.hostname;
  if (LOCAL_HOSTS.has(host)) return `${url.protocol}//${host}:${LOCAL_NEXUS_PORT}`;
  if (host.startsWith('staging-admin.')) {
    return `${url.protocol}//staging-nexus.${host.slice('staging-admin.'.length)}`;
  }
  if (host.startsWith('admin.')) return `${url.protocol}//nexus.${host.slice('admin.'.length)}`;
  // A preview deployment has no Nexus twin, and production is the safe landing.
  return PROD_NEXUS_ORIGIN;
}
