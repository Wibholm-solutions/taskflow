import { test, expect } from '../fixtures';

test.use({ hasTouch: true });

async function swipeRightToComplete(page: import('@playwright/test').Page, text: string) {
  const taskCard = page.getByText(text);
  const box = await taskCard.boundingBox();
  if (!box) throw new Error(`Task "${text}" not found`);

  const startX = box.x + 20;
  const y = box.y + box.height / 2;

  // Use touchscreen API for reliable touch simulation
  await page.touchscreen.tap(startX, y);

  // Dispatch touch events directly for swipe gesture (threshold 80px, move 120px)
  const el = taskCard;
  for (let step = 0; step <= 6; step++) {
    const x = startX + step * 20;
    if (step === 0) {
      await el.dispatchEvent('touchstart', {
        touches: [{ clientX: x, clientY: y, identifier: 0 }],
        changedTouches: [{ clientX: x, clientY: y, identifier: 0 }],
      });
    } else {
      await el.dispatchEvent('touchmove', {
        touches: [{ clientX: x, clientY: y, identifier: 0 }],
        changedTouches: [{ clientX: x, clientY: y, identifier: 0 }],
      });
    }
  }
  await el.dispatchEvent('touchend', {
    touches: [],
    changedTouches: [{ clientX: startX + 120, clientY: y, identifier: 0 }],
  });
}

test.describe('Undo complete', () => {
  test('undo brings task back', async ({ page, apiHelper }) => {
    await apiHelper.createTask({ title: 'Undo me' });
    await page.goto('/');
    await expect(page.getByText('Undo me')).toBeVisible();

    await swipeRightToComplete(page, 'Undo me');

    // Snackbar should appear with undo button
    await expect(page.getByRole('button', { name: /undo/i })).toBeVisible({ timeout: 2000 });

    // Click undo
    await page.getByRole('button', { name: /undo/i }).click();

    // Task should reappear
    await expect(page.getByText('Undo me')).toBeVisible();
  });

  test('task completes after delay expires', async ({ page, apiHelper }) => {
    await apiHelper.createTask({ title: 'Wait for me' });
    await page.goto('/');
    await expect(page.getByText('Wait for me')).toBeVisible();

    await swipeRightToComplete(page, 'Wait for me');

    // Wait for snackbar to disappear (5s delay + margin)
    await expect(page.getByRole('button', { name: /undo/i })).not.toBeVisible({ timeout: 7000 });

    // Verify task is gone from server
    await page.reload();
    await expect(page.getByText('Wait for me')).not.toBeVisible();
  });
});
