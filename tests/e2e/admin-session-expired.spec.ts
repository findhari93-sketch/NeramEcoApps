/**
 * Admin: a signed-in-looking session whose Microsoft token can no longer be renewed.
 *
 * Reproduces the Centres report (2026-10-17): the sidebar showed the staff
 * member's name because MSAL still had the account cached in localStorage, but
 * the refresh token behind it was gone, so every /api/ call went out with no
 * token and the page said "Sign in again: no Microsoft token was sent." with no
 * way to do so.
 *
 * Now the call waits on a Sign in again dialog (popup sign-in, so the page and
 * anything typed on it survive). This spec seeds exactly that state: an account
 * entry with no tokens. It cannot finish a real Microsoft sign-in (tenant MFA
 * wall), so the success path, replaying the call with the fresh token, is
 * covered by apps/admin/src/lib/api-auth-fetch.test.ts.
 *
 * Run: pnpm test:e2e tests/e2e/admin-session-expired.spec.ts --project=admin-chrome --no-deps
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { test, expect } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';

// The admin app's own registration (Playwright's config loads Nexus env first).
const adminEnvFile = path.resolve(__dirname, '../../apps/admin/.env.local');
const adminEnv = fs.existsSync(adminEnvFile) ? dotenv.parse(fs.readFileSync(adminEnvFile)) : {};
const CLIENT_ID = adminEnv.NEXT_PUBLIC_AZURE_AD_CLIENT_ID || '';
const TENANT_ID = adminEnv.NEXT_PUBLIC_AZURE_AD_TENANT_ID || '';

// No saved MSAL state and no network-level test token: the page must manage on its own.
test.use({ storageState: { cookies: [], origins: [] }, extraHTTPHeaders: {} });

test.describe('Admin session expired', () => {
  test.skip(!CLIENT_ID || !TENANT_ID, 'Azure AD client and tenant ids are not configured');

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      ({ clientId, tenantId }) => {
        // Playwright sets navigator.webdriver, which keeps the dialog out of other
        // admin specs. This one is about the dialog, so present as a normal browser.
        Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
        if (localStorage.getItem('msal.account.keys')) return;
        const oid = '00000000-0000-0000-0000-00000000e2e0';
        const env = 'login.windows.net';
        const key = `${oid}.${tenantId}-${env}-${tenantId}`;
        localStorage.setItem(
          key,
          JSON.stringify({
            homeAccountId: `${oid}.${tenantId}`,
            environment: env,
            realm: tenantId,
            localAccountId: oid,
            username: 'expired.session@neramclasses.com',
            name: 'Expired Session',
            authorityType: 'MSSTS',
            clientInfo: btoa(JSON.stringify({ uid: oid, utid: tenantId })),
          }),
        );
        localStorage.setItem('msal.account.keys', JSON.stringify([key]));
        localStorage.setItem(`msal.token.keys.${clientId}`, JSON.stringify({ idToken: [], accessToken: [], refreshToken: [] }));
      },
      { clientId: CLIENT_ID, tenantId: TENANT_ID },
    );
  });

  test('a cached account with no token asks to sign in again and holds the call', async ({ page }) => {
    // Silent renewal (up to 10s), a Microsoft popup and a dev-server compile.
    test.setTimeout(120_000);
    const centreCalls: string[] = [];
    page.on('request', (r) => {
      if (new URL(r.url()).pathname === '/api/centres') centreCalls.push(r.headers()['authorization'] ?? 'none');
    });

    await page.goto(`${APP_URLS.admin}/centres`);

    const dialog = page.getByRole('dialog', { name: 'Sign in again to keep working' });
    // Silent renewal first tries a hidden frame, which can take up to MSAL's 10s.
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(dialog).toContainText('expired.session@neramclasses.com');
    await expect(dialog).toContainText('Anything you typed on this page stays as it is.');

    // The Centres call waits on the answer instead of going out without a token.
    expect(centreCalls).toEqual([]);

    // Sign in again opens a Microsoft popup (not a redirect: the page stays put).
    const urlBefore = page.url();
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      dialog.getByRole('button', { name: 'Sign in again' }).click(),
    ]);
    // MSAL opens the window blank, then points it at Microsoft.
    await popup.waitForURL(/login\.microsoftonline\.com/, { waitUntil: 'commit', timeout: 15_000 });
    expect(page.url()).toBe(urlBefore);

    // Closing the popup leaves the dialog up with a plain explanation.
    await popup.close();
    await expect(dialog.getByRole('alert')).toContainText('closed before it finished', { timeout: 15_000 });

    // Not now releases the waiting call, which the server refuses as before.
    await dialog.getByRole('button', { name: 'Not now' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Sign in again: no Microsoft token was sent.')).toBeVisible({ timeout: 15_000 });
    // Dev Strict Mode runs the page's effect twice; both calls waited on the one answer.
    expect(centreCalls.length).toBeGreaterThan(0);
    expect(centreCalls.every((auth) => auth === 'none')).toBe(true);
  });

  test('the server marks a token problem so only that 401 opens the dialog', async ({ request }) => {
    const res = await request.get(`${APP_URLS.admin}/api/centres`);
    expect(res.status()).toBe(401);
    expect(res.headers()['x-neram-reauth']).toBe('1');
  });
});
