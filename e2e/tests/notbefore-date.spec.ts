import { test, expect } from '../fixtures';

test.describe('notBefore date display', () => {
  test('upcoming task shows notBefore date in card', async ({ page, apiHelper }) => {
    // Create a task with a future notBefore date so it appears in "Kommende"
    const futureDate = '2099-06-15';
    await apiHelper.createTask({ title: 'Future task', notBefore: futureDate });

    await page.goto('/');

    // The task should appear in the upcoming section with its notBefore date
    const taskCard = page.locator('[data-upcoming="true"]').filter({ hasText: 'Future task' });
    await expect(taskCard).toBeVisible();

    // The purple notBefore badge should show the formatted date
    const notBeforeBadge = taskCard.locator('.text-purple-400');
    await expect(notBeforeBadge).toBeVisible();
    await expect(notBeforeBadge).toContainText('Jun 15');
  });

  test('task without notBefore has no start-date badge', async ({ page, apiHelper }) => {
    await apiHelper.createTask({ title: 'Regular task' });

    await page.goto('/');

    await expect(page.getByText('Regular task')).toBeVisible();
    await expect(page.locator('.text-purple-400')).not.toBeVisible();
  });
});
