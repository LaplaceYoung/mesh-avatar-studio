import { dismissGuide, samplePresent, sampleSkipReason } from './sample';
import { expect, test } from '@playwright/test';

// APG Menu Button behavior: opening one toolbar menu closes the other; clicking outside or
// pressing Escape dismisses the open menu; the trigger that opened the menu keeps focus after
// it is closed with Escape.
test('toolbar menus are mutually exclusive, dismiss on outside click and Escape', async ({ page }) => {
  test.skip(!samplePresent, sampleSkipReason);
  await page.goto('/');
  await dismissGuide(page);
  await expect(page.getByText('Engine ready', { exact: true })).toBeVisible();

  const openMenu = page.locator('.open-menu');
  const exportMenu = page.getByTestId('export-menu');
  const openSummary = openMenu.locator('summary');
  const exportSummary = exportMenu.locator('summary');

  // Both start closed.
  await expect(openMenu).not.toHaveJSProperty('open', true);
  await expect(exportMenu).not.toHaveJSProperty('open', true);

  // Open the project menu, then the export menu — the first must close.
  await openSummary.click();
  await expect(openMenu).toHaveJSProperty('open', true);
  await exportSummary.click();
  await expect(exportMenu).toHaveJSProperty('open', true);
  await expect(openMenu).not.toHaveJSProperty('open', true);

  // Reverse direction.
  await openSummary.click();
  await expect(openMenu).toHaveJSProperty('open', true);
  await expect(exportMenu).not.toHaveJSProperty('open', true);

  // Clicking outside closes.
  await page.locator('h1').first().click({ position: { x: 4, y: 4 } });
  await expect(openMenu).not.toHaveJSProperty('open', true);

  // Escape closes and returns focus to the summary.
  await openSummary.click();
  await expect(openMenu).toHaveJSProperty('open', true);
  await page.keyboard.press('Escape');
  await expect(openMenu).not.toHaveJSProperty('open', true);
  await expect(openSummary).toBeFocused();
});
