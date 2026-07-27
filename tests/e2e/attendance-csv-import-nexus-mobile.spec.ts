import { test, expect } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';

/**
 * The Teams attendance CSV import, in a real browser at a real phone size.
 *
 * The unit tests cover the parser exhaustively, but they run in Node against a
 * synthesised ArrayBuffer. The single highest-risk piece of this feature is the
 * decode step: the export is UTF-16 LE despite its .csv name, and `File.text()`
 * would turn it into interleaved NUL characters. Only a browser, given a real
 * File through a real file input, proves that path works. That is what this
 * spec exists for, and it cannot be proven any other way.
 *
 * Everything here is client-side up to the Import button, which is deliberately
 * never pressed: committing would write attendance to whatever class this
 * environment happens to surface. The API side of the import is covered in
 * attendance-teams-nexus.spec.ts.
 */

const NEXUS = APP_URLS.nexus;

/** A Teams export, tab delimited, encoded the way Teams actually encodes it. */
function buildUtf16Report(): Buffer {
  const text = [
    '1. Summary',
    'Meeting title\tJEE B.Arch Session 1',
    'Attended participants\t2',
    '',
    '2. Participants',
    'Name\tFirst join\tLast leave\tIn-meeting duration\tEmail\tParticipant ID (UPN)\tRole',
    'Test Student One\t7/22/26, 7:02:11 PM\t7/22/26, 8:30:02 PM\t1h 27m 51s\te2etestingstudent@neramclasses.com\te2etestingstudent@neramclasses.com\tAttendee',
    'Nobody Here\t7/22/26, 7:05:00 PM\t7/22/26, 7:06:00 PM\t1m 0s\tnobody@example.com\tnobody@example.com\tAttendee',
  ].join('\r\n');

  // BOM plus UTF-16 LE, exactly as Teams writes it.
  return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
}

test.describe('Teams attendance CSV import (mobile)', () => {
  test('375px: decodes a UTF-16 report, reviews it, and never scrolls sideways', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/timetable`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    const attendanceButton = page.getByRole('button', { name: /attendance/i }).first();
    test.skip((await attendanceButton.count()) === 0, 'No class with an attendance sheet on screen');
    await attendanceButton.click().catch(() => {});
    await page.waitForTimeout(1500);

    // The upload entry point only appears once a Teams sync has actually failed,
    // which is the state this environment is in. If Teams is working, there is
    // nothing to fall back to and nothing to test.
    const uploadButton = page.getByRole('button', { name: /upload teams report/i });
    test.skip(
      (await uploadButton.count()) === 0,
      'Attendance is not in a failed state, so the fallback is not offered',
    );

    await uploadButton.click();
    await page.waitForTimeout(600);

    await page.setInputFiles('input[type="file"]', {
      name: 'meetingAttendanceReport.csv',
      mimeType: 'text/csv',
      buffer: buildUtf16Report(),
    });
    await page.waitForTimeout(1200);

    // If the decode had failed, the parser would have reported a fatal and the
    // review groups would never render.
    await expect(page.getByText(/not on this roster/i)).toBeVisible();
    await expect(page.getByText(/meetingAttendanceReport\.csv/i)).toBeVisible();

    // "Nobody Here" is not on any roster, so the count must be at least one.
    const unmatchedRow = page.getByText(/not on this roster/i).first();
    await expect(unmatchedRow).toBeVisible();

    const noOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    );
    expect(noOverflow, 'import dialog must not scroll horizontally at 375px').toBe(true);

    // Threshold toggles and the commit button are the repeated taps here.
    const toggles = page.getByRole('button', { name: /any join|5 min|15 min/i });
    const toggleCount = await toggles.count();
    expect(toggleCount).toBeGreaterThan(0);
    for (let i = 0; i < toggleCount; i++) {
      const box = await toggles.nth(i).boundingBox();
      if (box) expect(box.height).toBeGreaterThanOrEqual(44);
    }

    const importButton = page.getByRole('button', { name: /^import /i });
    const importBox = await importButton.boundingBox();
    if (importBox) expect(importBox.height).toBeGreaterThanOrEqual(44);

    // Deliberately not clicked: this must not write attendance to a real class.
    await context.close();
  });

  test('375px: a file that is not an attendance report is refused, not half-imported', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/timetable`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    const attendanceButton = page.getByRole('button', { name: /attendance/i }).first();
    test.skip((await attendanceButton.count()) === 0, 'No class with an attendance sheet on screen');
    await attendanceButton.click().catch(() => {});
    await page.waitForTimeout(1500);

    const uploadButton = page.getByRole('button', { name: /upload teams report/i });
    test.skip(
      (await uploadButton.count()) === 0,
      'Attendance is not in a failed state, so the fallback is not offered',
    );

    await uploadButton.click();
    await page.waitForTimeout(600);

    await page.setInputFiles('input[type="file"]', {
      name: 'holiday-photos.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('this is just prose\nwith no columns at all', 'utf8'),
    });
    await page.waitForTimeout(1000);

    await expect(page.getByText(/does not look like a Teams attendance report/i)).toBeVisible();

    const importButton = page.getByRole('button', { name: /^import /i });
    await expect(importButton).toBeDisabled();

    await context.close();
  });
});
