import { test, expect } from '../fixtures';

test.describe('Touch drag-and-drop reordering', () => {
  test('drag task down one position within same bucket via touch', async ({ page, apiHelper }) => {
    const alpha = await apiHelper.createTask({ title: 'Alpha', priority: 'default' });
    const beta = await apiHelper.createTask({ title: 'Beta', priority: 'default' });

    await page.goto('/todo');
    await expect(page.locator('[data-bucket] .text-white.text-sm')).toHaveText(['Alpha', 'Beta']);

    // Simulate long-press touch drag on the drag handle
    await page.evaluate(async ({ alphaId, betaId }) => {
      const handle = document.querySelector(`[data-testid="task-drag-handle-${alphaId}"]`)!;
      const targetEl = document.querySelector(`[data-testid="task-${betaId}"]`)!;
      const handleRect = handle.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();

      const startX = handleRect.left + handleRect.width / 2;
      const startY = handleRect.top + handleRect.height / 2;
      const endY = targetRect.top + targetRect.height / 2;

      // touchstart on handle
      handle.dispatchEvent(new TouchEvent('touchstart', {
        bubbles: true,
        touches: [new Touch({ identifier: 0, target: handle, clientX: startX, clientY: startY })],
      }));

      // Wait for long-press timer (300ms)
      await new Promise((r) => setTimeout(r, 350));

      // touchmove to target position (on document, as the hook listens there)
      document.dispatchEvent(new TouchEvent('touchmove', {
        bubbles: true,
        cancelable: true,
        touches: [new Touch({ identifier: 0, target: document, clientX: startX, clientY: endY })],
      }));

      // Small delay for state update
      await new Promise((r) => setTimeout(r, 50));

      // touchend
      document.dispatchEvent(new TouchEvent('touchend', {
        bubbles: true,
      }));
    }, { alphaId: alpha.id, betaId: beta.id });

    // Wait for the reorder API call and re-render
    await page.waitForTimeout(500);

    await expect(page.locator('[data-bucket] .text-white.text-sm')).toHaveText(['Beta', 'Alpha']);
  });

  test('drag task up one position within same bucket via touch', async ({ page, apiHelper }) => {
    const alpha = await apiHelper.createTask({ title: 'Alpha', priority: 'default' });
    const beta = await apiHelper.createTask({ title: 'Beta', priority: 'default' });

    await page.goto('/todo');
    await expect(page.locator('[data-bucket] .text-white.text-sm')).toHaveText(['Alpha', 'Beta']);

    // Drag Beta up to Alpha's position
    await page.evaluate(async ({ alphaId, betaId }) => {
      const handle = document.querySelector(`[data-testid="task-drag-handle-${betaId}"]`)!;
      const targetEl = document.querySelector(`[data-testid="task-${alphaId}"]`)!;
      const handleRect = handle.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();

      const startX = handleRect.left + handleRect.width / 2;
      const startY = handleRect.top + handleRect.height / 2;
      const endY = targetRect.top + targetRect.height / 2;

      handle.dispatchEvent(new TouchEvent('touchstart', {
        bubbles: true,
        touches: [new Touch({ identifier: 0, target: handle, clientX: startX, clientY: startY })],
      }));

      await new Promise((r) => setTimeout(r, 350));

      document.dispatchEvent(new TouchEvent('touchmove', {
        bubbles: true,
        cancelable: true,
        touches: [new Touch({ identifier: 0, target: document, clientX: startX, clientY: endY })],
      }));

      await new Promise((r) => setTimeout(r, 50));

      document.dispatchEvent(new TouchEvent('touchend', { bubbles: true }));
    }, { alphaId: alpha.id, betaId: beta.id });

    await page.waitForTimeout(500);

    await expect(page.locator('[data-bucket] .text-white.text-sm')).toHaveText(['Beta', 'Alpha']);
  });
});
