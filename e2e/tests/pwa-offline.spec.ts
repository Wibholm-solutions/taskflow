import { test, expect } from '../fixtures';

test.describe('PWA offline', () => {
  test('app loads from cache while offline', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // First visit primes the cache and should land on the scoped app URL.
    await page.goto('http://localhost:3000/');
    await expect(page).toHaveURL(/\/$/); // ends with trailing slash
    await expect(page.getByText('TaskFlow')).toBeVisible();

    await page.waitForFunction(async () => {
      if (!navigator.serviceWorker) return false;
      const registrations = await navigator.serviceWorker.getRegistrations();
      return registrations.some((registration) => Boolean(registration.active));
    });

    // Give SW time to cache assets
    await page.waitForTimeout(2000);

    // Go offline
    await context.setOffline(true);

    // Reload - should still show cached app shell
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText('TaskFlow')).toBeVisible({ timeout: 10000 });

    await context.setOffline(false);
    await context.close();
  });
});
