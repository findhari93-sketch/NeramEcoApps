/**
 * Where Admin lives for this deployment. Only Admin holds the Microsoft account
 * rights, so the app forwards a student's own request there. ADMIN_APP_URL wins;
 * otherwise the host decides (staging app to staging admin, local to port 3013).
 */
export function adminOriginFor(host: string | null | undefined, configured?: string | null): string {
  if (configured) return configured.replace(/\/+$/, '');
  const h = (host || '').toLowerCase();
  if (h.startsWith('localhost') || h.startsWith('127.0.0.1')) return 'http://localhost:3013';
  if (h.startsWith('staging-app.')) return 'https://staging-admin.neramclasses.com';
  return 'https://admin.neramclasses.com';
}
