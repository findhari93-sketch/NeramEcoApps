import { test, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { APP_URLS } from '../utils/credentials';

/**
 * Backup numbers (phone_attempts): every number typed into a phone sign-in is
 * saved the moment Send OTP is tapped, signed in or not. Both apps serve
 * capture-phone (the app for most dialogs, marketing for /enroll).
 *
 * Signed-out rows are filed under an anonymous id starting `anon_e2e0e2e0`, so
 * a run leaves at most a few staging rows that are easy to find and delete:
 *   delete from phone_attempts where anonymous_id like 'anon_e2e0e2e0%';
 * The Admin screens need a staff session (Entra MFA keeps that out of
 * Playwright); they are covered by apps/admin/src/lib/phone-attempts-view.test.ts.
 */

const anonId = () => `anon_e2e0e2e0${randomBytes(12).toString('hex')}`;
const ORIGINS = [
  { name: 'app', url: APP_URLS.student },
  { name: 'marketing', url: APP_URLS.marketing },
];

for (const { name, url } of ORIGINS) {
  test.describe(`capture-phone on ${name}`, () => {
    test('saves a signed-out number, then its failure reason', async ({ request }) => {
      const anonymousId = anonId();
      const entered = await request.post(`${url}/api/auth/capture-phone`, {
        data: { anonymousId, phoneNumber: '+919999900002', source: '/demo-class' },
      });
      expect(entered.status()).toBe(200);
      expect(await entered.json()).toEqual({ captured: true });

      const failed = await request.post(`${url}/api/auth/capture-phone`, {
        data: {
          anonymousId,
          phoneNumber: '+919999900002',
          event: 'failed',
          errorCode: 'auth/internal-error',
          errorMessage: 'reCAPTCHA has already been rendered in this element',
        },
      });
      expect(await failed.json()).toEqual({ captured: true });
    });

    test('never lets a caller mark a number verified', async ({ request }) => {
      const res = await request.post(`${url}/api/auth/capture-phone`, {
        data: { anonymousId: anonId(), phoneNumber: '+919999900002', event: 'verified' },
      });
      expect(res.status()).toBe(400);
    });

    test('rejects a number that is not a phone number', async ({ request }) => {
      const res = await request.post(`${url}/api/auth/capture-phone`, {
        data: { anonymousId: anonId(), phoneNumber: '12345' },
      });
      expect(res.status()).toBe(400);
    });

    test('stores nothing without an account or a visitor id', async ({ request }) => {
      const res = await request.post(`${url}/api/auth/capture-phone`, {
        data: { phoneNumber: '+919999900002' },
      });
      expect(await res.json()).toEqual({ captured: false });
    });
  });
}
