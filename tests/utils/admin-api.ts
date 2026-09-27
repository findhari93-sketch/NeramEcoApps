import type { APIRequestContext } from '@playwright/test';
import { ADMIN_ACCOUNT, APP_URLS } from './credentials';

/**
 * Admin API access for specs that run outside the admin-chrome project.
 *
 * apps/admin/src/middleware.ts requires a staff token on every /api/ call. Off
 * production it accepts `test_<base64 email>` for an existing staff user, so a
 * spec can call the admin API without a Microsoft sign-in. The admin-chrome
 * project sends this header by default (playwright.config.ts); other projects
 * pass it per call with `adminApiHeaders()`.
 */
export function adminTestToken(email: string = ADMIN_ACCOUNT.email): string {
  return `test_${Buffer.from(email).toString('base64')}`;
}

export function adminApiHeaders(email?: string): Record<string, string> {
  return { Authorization: `Bearer ${adminTestToken(email)}` };
}

/**
 * The test admin's users.id, as the admin app resolves it. Replaces the old
 * `/api/auth/me?msOid=...` call, which the hardened route no longer accepts.
 */
export async function resolveAdminId(request: APIRequestContext): Promise<string> {
  const res = await request.get(`${APP_URLS.admin}/api/auth/me`, {
    headers: adminApiHeaders(),
    failOnStatusCode: false,
    timeout: 15_000,
  });
  if (res.status() !== 200) {
    throw new Error(
      `Could not resolve the admin user id (${res.status()}). Is the admin app running on ${APP_URLS.admin}?`,
    );
  }
  return (await res.json()).user.id;
}
