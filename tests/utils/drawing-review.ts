import { expect, type Page } from '@playwright/test';

/**
 * Open the rubric on the drawing review screen.
 *
 * The rubric is optional and starts folded behind "Add scores (optional)" (or
 * "Review Gemini's scores (optional)" when a draft exists), unless the drawing
 * already has a rating. Either way this leaves the Scores panel on screen.
 */
export async function showScores(page: Page): Promise<void> {
  const heading = page.getByRole('heading', { name: 'Scores', exact: true });
  const toggle = page.getByRole('button', { name: /scores \(optional\)$/ });
  // The panel loads over the network and a cold dev route compiles on first hit.
  await expect(heading.or(toggle)).toBeVisible({ timeout: 90_000 });
  if (await toggle.isVisible()) await toggle.click();
  await expect(heading).toBeVisible({ timeout: 90_000 });
}
