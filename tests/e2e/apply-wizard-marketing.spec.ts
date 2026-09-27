import { test, expect } from '@playwright/test';

/**
 * The four-step apply flow on marketing: entry choices, About you fields,
 * location on request only, PIN lookup, phone gate, old-draft remap, events.
 */
const MARKETING_URL = process.env.E2E_MARKETING_URL || 'http://localhost:3010';

test.describe('Apply wizard', () => {
  test.beforeEach(async ({ page }) => {
    // Count geolocation calls without ever prompting.
    await page.addInitScript(() => {
      (window as any).__geoCalls = 0;
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition: (_ok: unknown, fail: (e: { message: string }) => void) => {
            (window as any).__geoCalls += 1;
            fail({ message: 'denied' });
          },
        },
      });
    });
    await page.route('**/api/pincode/625001*', (route) =>
      route.fulfill({ json: { success: true, data: { city: 'Madurai', district: 'Madurai', state: 'Tamil Nadu' } } }),
    );
    await page.route('**/api/funnel-events', (route) => route.fulfill({ json: { ok: true } }));
  });

  test('step 1 shows the entry choices, then the fields, and never asks for location on its own', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/apply`);
    await expect(page.getByRole('heading', { name: /about you/i })).toBeVisible();
    await expect(page.getByText(/step 1 of 4/i)).toBeVisible();
    await page.getByRole('button', { name: /type it myself/i }).click();
    await expect(page.locator('input[name="firstName"]')).toBeVisible();
    expect(await page.evaluate(() => (window as any).__geoCalls)).toBe(0);

    await page.getByRole('button', { name: /use my current location/i }).click();
    expect(await page.evaluate(() => (window as any).__geoCalls)).toBe(1);
    await expect(page.getByRole('alert').filter({ hasText: /pin code/i })).toBeVisible();
  });

  test('a PIN code fills City and State, which stay editable', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/apply`);
    await page.getByRole('button', { name: /type it myself/i }).click();
    await page.locator('input[name="pincode"]').fill('625001');
    await expect(page.locator('input[name="city"]')).toHaveValue('Madurai');
    await expect(page.locator('input[name="state"]')).toHaveValue('Tamil Nadu');
    await expect(page.getByText('Madurai, Tamil Nadu')).toBeVisible();
    for (const edit of await page.getByRole('button', { name: /^edit$/i }).all()) {
      const box = (await edit.boundingBox())!;
      expect(Math.min(box.width, box.height), 'pencil is a 44 px target').toBeGreaterThanOrEqual(44);
    }
    await page.getByRole('button', { name: /^edit$/i }).first().click();
    await expect(page.locator('input[name="city"]')).toBeEditable();
  });

  test('Continue asks for phone verification before leaving step 1', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/apply`);
    await page.getByRole('button', { name: /type it myself/i }).click();
    await page.locator('input[name="firstName"]').fill('Arun');
    await page.locator('input[name="fatherName"]').fill('Rajendran');
    await page.getByRole('button', { name: /^continue$/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/step 1 of 4/i)).toBeVisible();
  });

  test('the father name field is empty for a new visitor (no display-name guess)', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/apply`);
    await page.getByRole('button', { name: /type it myself/i }).click();
    await expect(page.locator('input[name="fatherName"]')).toHaveValue('');
  });

  test('choosing the manual path records application_started and manual_entry_started', async ({ page }) => {
    const events: string[] = [];
    await page.route('**/api/funnel-events', async (route) => {
      const body = route.request().postDataJSON();
      const list = Array.isArray(body?.events) ? body.events : [body];
      for (const e of list) if (e?.event) events.push(e.event);
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto(`${MARKETING_URL}/apply`);
    await page.getByRole('button', { name: /type it myself/i }).click();
    await page.locator('input[name="firstName"]').fill('A');
    await expect.poll(() => events.includes('application_started'), { timeout: 8000 }).toBe(true);
    await expect.poll(() => events.includes('manual_entry_started'), { timeout: 8000 }).toBe(true);
  });

  test('an old four-step draft reopens on Your course, not on Pay', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'neram_application_draft',
        JSON.stringify({
          activeStep: 2,
          savedAt: new Date().toISOString(),
          formData: {
            personal: {
              firstName: 'Arun',
              fatherName: 'Rajendran',
              email: '',
              phone: '9876543210',
              parentPhone: '',
              phoneVerified: true,
              phoneVerifiedAt: new Date().toISOString(),
              dateOfBirth: '2008-03-12',
              gender: 'male',
            },
            location: {
              country: 'IN',
              pincode: '625001',
              city: 'Madurai',
              state: 'Tamil Nadu',
              district: '',
              address: '',
              latitude: null,
              longitude: null,
              locationSource: 'pincode',
              detectedLocation: null,
            },
            academic: {
              applicantCategory: 'school_student',
              casteCategory: null,
              targetExamYear: '2027-28',
              schoolType: null,
              schoolStudentData: { current_class: '11', school_name: 'TVS', board: 'CBSE' },
              diplomaStudentData: null,
              collegeStudentData: null,
              workingProfessionalData: null,
            },
            course: {
              interestCourse: null,
              selectedCourseId: null,
              selectedCenterId: null,
              selectedCenterName: null,
              hybridLearningAccepted: false,
              learningMode: 'hybrid',
            },
            payment: {
              paymentDate: '2026-09-26',
              paymentType: 'full',
              installmentNumber: 1,
              paymentMethod: '',
              transactionReference: '',
              paymentProofUrl: null,
              paymentProofFileName: null,
            },
            termsAccepted: false,
            utmSource: null,
            utmMedium: null,
            utmCampaign: null,
            referralCode: null,
            gclid: null,
            wbraid: null,
          },
        }),
      );
    });
    await page.goto(`${MARKETING_URL}/apply`);
    await expect(page.getByText(/step 2 of 4/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /your course/i })).toBeVisible();
  });

  test('a saved draft that reached Pay reopens on Review, without the old application number', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'neram_application_draft',
        JSON.stringify({
          version: 2,
          activeStep: 3,
          savedAt: new Date().toISOString(),
          submittedApplication: { id: 'lead-x', applicationNumber: 'NERAM-2609-99999' },
          formData: { personal: { firstName: 'Arun', fatherName: 'Rajendran', phone: '9876543210', phoneVerified: true }, location: {}, academic: {}, course: {} },
        }),
      );
    });
    await page.goto(`${MARKETING_URL}/apply`);
    await expect(page.getByText(/step 3 of 4/i)).toBeVisible();
    await expect(page.getByText('NERAM-2609-99999')).toHaveCount(0);
  });

  test('the recovery link points to Tools', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/apply`);
    await expect(page.getByRole('link', { name: /explore neram tools/i })).toHaveAttribute('href', /\/tools$/);
  });
});
