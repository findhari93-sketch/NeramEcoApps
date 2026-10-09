import { test, expect } from '@playwright/test';

/**
 * The four-step apply flow on marketing: About you (name and father's name,
 * mobile, class, and a PIN code that finds the place, or a country and city
 * abroad), the few details left on Review, phone gate, old-draft remap, events.
 */
const MARKETING_URL = process.env.E2E_MARKETING_URL || 'http://localhost:3010';

/** A version 2 draft that reopens on Review: name, verified phone, class and city done. */
function reviewDraft(personal: Record<string, unknown> = {}) {
  return JSON.stringify({
    version: 2,
    activeStep: 2,
    savedAt: new Date().toISOString(),
    formData: {
      personal: { firstName: 'Arun', fatherName: 'Rajendran', phone: '9876543210', phoneVerified: true, ...personal },
      location: { country: 'IN', pincode: '625001', city: 'Madurai', state: 'Tamil Nadu', locationSource: 'pincode' },
      academic: {
        currentlyIn: '12',
        applicantCategory: 'school_student',
        targetExamYear: '2027-28',
        schoolStudentData: { current_class: '12', school_name: 'TVS', board: 'CBSE' },
      },
      course: { interestCourse: 'not_sure', learningMode: 'online_only' },
    },
  });
}

const currentStep = (page: import('@playwright/test').Page) => page.locator('[aria-current="step"]');

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

  test('step 1 asks name, father name, mobile, email, class and the PIN, and never asks for location', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/apply`);
    await expect(page.getByRole('heading', { name: /about you/i })).toBeVisible();
    await expect(currentStep(page)).toContainText(/about you/i);
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible();
    for (const name of ['firstName', 'fatherName', 'phone', 'email', 'pincode']) {
      await expect(page.locator(`input[name="${name}"]`)).toBeVisible();
    }
    await expect(page.getByRole('group', { name: /currently in/i })).toBeVisible();
    await expect(page.locator('input[name="dateOfBirth"], input[name="state"], input[name="city"]')).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).__geoCalls)).toBe(0);
  });

  test('the Google card goes straight to Google, with no sign-in dialog of our own', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/apply`);
    const card = page.getByRole('button', { name: /continue with google/i });
    await expect(card).toBeVisible();
    // Retried: a click before hydration does nothing.
    const popup = await (async () => {
      for (let i = 0; i < 5; i++) {
        const waiting = page.waitForEvent('popup', { timeout: 5000 }).catch(() => null);
        await card.click();
        const opened = await waiting;
        if (opened) return opened;
      }
      return null;
    })();
    expect(popup, 'Google sign-in window').not.toBeNull();
    await popup!.close();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('Continue asks for phone verification before leaving step 1', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/apply`);
    await page.locator('input[name="firstName"]').fill('Arun');
    await page.locator('input[name="fatherName"]').fill('Rajendran');
    await page.getByRole('button', { name: /class 12/i }).click();
    await page.locator('input[name="pincode"]').fill('625001');
    await expect(page.getByTestId('apply-place-line')).toContainText('Madurai, Tamil Nadu, India');
    await page.getByRole('button', { name: /continue to your course/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(currentStep(page)).toContainText(/about you/i);
  });

  test('a PIN code shows the place under it, and Edit lets the student correct it', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/apply`);
    await page.locator('input[name="pincode"]').fill('625001');
    const line = page.getByTestId('apply-place-line');
    await expect(line).toContainText('Madurai, Tamil Nadu, India');
    await expect(page.locator('input[name="state"]')).toHaveCount(0);

    const edit = page.getByRole('button', { name: /edit place/i });
    const box = (await edit.boundingBox())!;
    expect(Math.min(box.width, box.height), 'pencil is a 44 px target').toBeGreaterThanOrEqual(44);
    await edit.click();
    await page.locator('input[name="city"]').fill('Thirumangalam');
    await expect(page.locator('input[name="state"]')).toHaveValue('Tamil Nadu');
    // The edit is saved with the draft as the student typed it.
    await expect
      .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('neram_application_draft') || '{}').formData?.location))
      .toMatchObject({ city: 'Thirumangalam', locationSource: 'manual', detectedLocation: { city: 'Madurai' } });
  });

  test('step 1 asks for the location only on a press', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/apply`);
    await page.getByRole('button', { name: /use my location/i }).click();
    expect(await page.evaluate(() => (window as any).__geoCalls)).toBe(1);
    await expect(page.getByRole('alert').filter({ hasText: /pin code/i })).toBeVisible();
  });

  test('a student abroad picks a country and types a city, with no PIN or state', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/apply`);
    await page.getByRole('button', { name: /live outside india/i }).click();
    await expect(page.locator('input[name="pincode"]')).toHaveCount(0);
    await expect(page.locator('input[name="country"]')).toHaveValue('AE');
    await page.locator('input[name="city"]').fill('Dubai');
    // The mobile was still empty, so its code followed.
    await expect(page.getByRole('button', { name: /country code/i })).toContainText('+971');
    await page.getByRole('button', { name: /i live in india/i }).click();
    await expect(page.locator('input[name="pincode"]')).toBeVisible();
  });

  test('Review asks only date of birth, gender, address and parent mobile', async ({ page }) => {
    await page.addInitScript((draft) => localStorage.setItem('neram_application_draft', draft), reviewDraft());
    await page.goto(`${MARKETING_URL}/apply`);
    await expect(currentStep(page)).toContainText(/review/i);
    await expect(page.getByRole('heading', { name: /a few more details/i })).toBeVisible();
    for (const name of ['dateOfBirth', 'address', 'parentPhone']) {
      await expect(page.locator(`[name="${name}"]`)).toBeVisible();
    }
    await expect(page.locator('input[name="fatherName"], input[name="pincode"], input[name="state"]')).toHaveCount(0);
    await expect(page.getByText('Rajendran')).toBeVisible();
    await expect(page.getByText('Madurai, Tamil Nadu, India, 625001')).toBeVisible();
    expect(await page.evaluate(() => (window as any).__geoCalls)).toBe(0);
  });

  test('typing on step 1 records application_started and manual_entry_started', async ({ page }) => {
    const events: string[] = [];
    await page.route('**/api/funnel-events', async (route) => {
      const body = route.request().postDataJSON();
      const list = Array.isArray(body?.events) ? body.events : [body];
      for (const e of list) if (e?.event) events.push(e.event);
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto(`${MARKETING_URL}/apply`);
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
    await expect(currentStep(page)).toContainText(/course/i);
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
    await expect(currentStep(page)).toContainText(/review/i);
    await expect(page.getByText('NERAM-2609-99999')).toHaveCount(0);
  });

  /**
   * The form sells one thing.
   *
   * Every step except Pay used to end with "Not ready for coaching? Explore Neram
   * Tools", directly under the primary button. It was built as an anti-dead-end,
   * but it offered a free alternative to the product being sold, to a reader who
   * had already shown intent by opening the form, and Tools earns nothing until
   * the subscription exists. Removed on the founder's instruction, 2026-10-04.
   *
   * Both halves are pinned here. Dropping the link without keeping a route to a
   * person would recreate the dead end the block was written to prevent, and the
   * reason removing it is safe is that ApplicationShell already pins Help, with
   * the office number behind it, in the top bar of every step.
   */
  test('the application form offers no exit to Tools, but always a person', async ({ page }) => {
    // domcontentloaded, not the default 'load': against a dev server this route
    // keeps a connection open and 'load' can outlast the 30s budget, which fails
    // the navigation before a single assertion runs. Every expect below auto-waits,
    // so the weaker signal costs nothing.
    await page.goto(`${MARKETING_URL}/apply`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('link', { name: /neram tools/i })).toHaveCount(0);
    await expect(page.locator('a[href$="/tools"]')).toHaveCount(0);

    // Retried, because the click can land before React has hydrated the shell and
    // a dead press leaves no menu to find. Each attempt presses Help again.
    const help = page.getByRole('button', { name: /help/i });
    await expect(async () => {
      await help.click();
      await expect(page.getByRole('menuitem', { name: /call us/i })).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 20000 });
  });
});
