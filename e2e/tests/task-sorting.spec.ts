import { test, expect } from '../fixtures';

test.describe('Task sorting', () => {
  test('overdue tasks appear before tasks with future/no deadline', async ({ page, apiHelper }) => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    await apiHelper.createTask({ title: 'Future task', deadline: tomorrow });
    await apiHelper.createTask({ title: 'Overdue task', deadline: yesterday });
    await apiHelper.createTask({ title: 'No deadline' });

    await page.goto('/');

    // Get all task titles in order
    const titles = await page.locator('[data-priority] .text-white.text-sm').allTextContents();

    const overdueIndex = titles.indexOf('Overdue task');
    const futureIndex = titles.indexOf('Future task');
    const noDeadlineIndex = titles.indexOf('No deadline');

    expect(overdueIndex).toBeLessThan(futureIndex);
    expect(overdueIndex).toBeLessThan(noDeadlineIndex);
  });

  test('high priority tasks appear before low priority', async ({ page, apiHelper }) => {
    await apiHelper.createTask({ title: 'Low priority', priority: 'low' });
    await apiHelper.createTask({ title: 'High priority', priority: 'high' });
    await apiHelper.createTask({ title: 'Normal priority', priority: 'default' });

    await page.goto('/');

    const titles = await page.locator('[data-priority] .text-white.text-sm').allTextContents();

    const highIndex = titles.indexOf('High priority');
    const defaultIndex = titles.indexOf('Normal priority');
    const lowIndex = titles.indexOf('Low priority');

    expect(highIndex).toBeLessThan(defaultIndex);
    expect(defaultIndex).toBeLessThan(lowIndex);
  });

  test('upcoming tasks (notBefore in future) appear in separate section', async ({ page, apiHelper }) => {
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

    await apiHelper.createTask({ title: 'Active task' });
    await apiHelper.createTask({ title: 'Upcoming task', notBefore: nextWeek });

    await page.goto('/');

    // "Active" section
    await expect(page.getByText('Active')).toBeVisible();
    await expect(page.getByText('Active task')).toBeVisible();

    // "Upcoming" section
    await expect(page.getByRole('heading', { name: 'Upcoming' })).toBeVisible();
    const upcomingItem = page.locator('[data-upcoming="true"]');
    await expect(upcomingItem).toBeVisible();
    await expect(upcomingItem).toContainText('Upcoming task');
  });

  test('manual reordering persists within one active bucket and keeps other buckets unchanged', async ({ page, apiHelper }) => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const high = await apiHelper.createTask({ title: 'High prio', priority: 'high' });
    const alpha = await apiHelper.createTask({ title: 'Alpha', priority: 'default' });
    const beta = await apiHelper.createTask({ title: 'Beta', priority: 'default' });
    const upcoming = await apiHelper.createTask({ title: 'Later', notBefore: tomorrow });

    await page.goto('/');

    await page.getByTestId(`task-drag-handle-${alpha.id}`).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByTestId(`task-drag-handle-${alpha.id}`).dragTo(page.getByTestId(`task-${beta.id}`));

    await expect(page.locator('[data-bucket] .text-white.text-sm')).toHaveText([
      'High prio',
      'Beta',
      'Alpha',
    ]);

    await expect(page.getByTestId(`task-drag-handle-${upcoming.id}`)).toHaveCount(0);

    await page.reload();

    await expect(page.locator('[data-bucket] .text-white.text-sm')).toHaveText([
      'High prio',
      'Beta',
      'Alpha',
    ]);
  });
});
