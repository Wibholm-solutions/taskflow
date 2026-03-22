import { test, expect } from '../fixtures';

test.use({ hasTouch: true });

test.describe('Touch drag-and-drop reordering', () => {
  test('reorders tasks within same bucket via long-press and drag', async ({ page, apiHelper }) => {
    const taskA = await apiHelper.createTask({ title: 'Task A', priority: 'default' });
    const taskB = await apiHelper.createTask({ title: 'Task B', priority: 'default' });
    const taskC = await apiHelper.createTask({ title: 'Task C', priority: 'default' });

    await page.goto('/todo');
    await expect(page.getByTestId(`task-${taskA.id}`)).toBeVisible();

    // Get drag handle and target positions
    const handleA = page.getByTestId(`task-drag-handle-${taskA.id}`);
    const targetC = page.getByTestId(`task-${taskC.id}`);

    const handleBox = await handleA.boundingBox();
    const targetBox = await targetC.boundingBox();
    if (!handleBox || !targetBox) throw new Error('Could not get bounding boxes');

    const startX = handleBox.x + handleBox.width / 2;
    const startY = handleBox.y + handleBox.height / 2;
    const endY = targetBox.y + targetBox.height - 5;

    // Simulate long-press: touchstart, wait 350ms, then touchmove to target, then touchend
    await page.touchscreen.tap(startX, startY); // This won't work for long-press, use dispatchEvent

    // Use page.evaluate for precise touch event control
    await page.evaluate(
      ({ sx, sy, ey }) => {
        const handle = document.querySelector('[data-testid]')?.closest('[data-testid]');
        const target = document.elementFromPoint(sx, sy);
        if (!target) return;

        target.dispatchEvent(
          new TouchEvent('touchstart', {
            bubbles: true,
            cancelable: true,
            touches: [new Touch({ identifier: 1, target, clientX: sx, clientY: sy })],
          })
        );

        return new Promise<void>((resolve) => {
          setTimeout(() => {
            // After long-press timer fires (300ms), move to target
            document.dispatchEvent(
              new TouchEvent('touchmove', {
                bubbles: true,
                cancelable: true,
                touches: [new Touch({ identifier: 1, target: document, clientX: sx, clientY: ey })],
              })
            );

            // Short delay then release
            setTimeout(() => {
              document.dispatchEvent(
                new TouchEvent('touchend', {
                  bubbles: true,
                  cancelable: true,
                  changedTouches: [new Touch({ identifier: 1, target: document, clientX: sx, clientY: ey })],
                })
              );
              resolve();
            }, 50);
          }, 350);
        });
      },
      { sx: startX, sy: startY, ey: endY }
    );

    // Wait for reorder to settle
    await page.waitForTimeout(200);

    // Assert new order: B, C, A (A was dragged after C)
    const titles = await page.locator('[data-bucket] .text-white.text-sm').allTextContents();
    expect(titles).toEqual(['Task B', 'Task C', 'Task A']);

    // Reload and verify persistence
    await page.reload();
    await expect(page.getByTestId(`task-${taskA.id}`)).toBeVisible();

    const titlesAfterReload = await page.locator('[data-bucket] .text-white.text-sm').allTextContents();
    expect(titlesAfterReload).toEqual(['Task B', 'Task C', 'Task A']);
  });
});
