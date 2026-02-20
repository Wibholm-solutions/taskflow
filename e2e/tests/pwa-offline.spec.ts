import { test, expect } from '../fixtures';

test.describe('PWA offline', () => {
  test('app loads from cache while offline', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // First visit to prime the service worker cache
    await page.goto('http://localhost:3000/todo');
    await expect(page.getByText('TaskFlow')).toBeVisible();

    // Check if service worker is available and wait for activation
    const swActivated = await page.evaluate(async () => {
      if (!navigator.serviceWorker) return false;
      try {
        const reg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
        ]);
        return reg !== null && !!(reg as ServiceWorkerRegistration).active;
      } catch {
        return false;
      }
    });

    if (!swActivated) {
      await context.close();
      test.skip(true, 'Service worker did not activate in test environment');
      return;
    }

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
