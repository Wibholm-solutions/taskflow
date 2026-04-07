import { test, expect } from '../fixtures';

test.describe('Task sorting', () => {
  test('overdue tasks appear before tasks with future/no deadline', async ({ page, apiHelper }) => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    await apiHelper.createTask({ title: 'Fremtidig opgave', deadline: tomorrow });
    await apiHelper.createTask({ title: 'Forfalden opgave', deadline: yesterday });
    await apiHelper.createTask({ title: 'Ingen deadline' });

    await page.goto('/');

    // Get all task titles in order
    const titles = await page.locator('[data-priority] .text-white.text-sm').allTextContents();

    const overdueIndex = titles.indexOf('Forfalden opgave');
    const futureIndex = titles.indexOf('Fremtidig opgave');
    const noDeadlineIndex = titles.indexOf('Ingen deadline');

    expect(overdueIndex).toBeLessThan(futureIndex);
    expect(overdueIndex).toBeLessThan(noDeadlineIndex);
  });

  test('high priority tasks appear before low priority', async ({ page, apiHelper }) => {
    await apiHelper.createTask({ title: 'Lav prioritet', priority: 'low' });
    await apiHelper.createTask({ title: 'Høj prioritet', priority: 'high' });
    await apiHelper.createTask({ title: 'Normal prioritet', priority: 'default' });

    await page.goto('/');

    const titles = await page.locator('[data-priority] .text-white.text-sm').allTextContents();

    const highIndex = titles.indexOf('Høj prioritet');
    const defaultIndex = titles.indexOf('Normal prioritet');
    const lowIndex = titles.indexOf('Lav prioritet');

    expect(highIndex).toBeLessThan(defaultIndex);
    expect(defaultIndex).toBeLessThan(lowIndex);
  });

  test('upcoming tasks (notBefore in future) appear in separate section', async ({ page, apiHelper }) => {
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

    await apiHelper.createTask({ title: 'Aktiv opgave' });
    await apiHelper.createTask({ title: 'Kommende opgave', notBefore: nextWeek });

    await page.goto('/');

    // "Aktive" section
    await expect(page.getByText('Aktive')).toBeVisible();
    await expect(page.getByText('Aktiv opgave')).toBeVisible();

    // "Kommende" section
    await expect(page.getByRole('heading', { name: 'Kommende' })).toBeVisible();
    const upcomingItem = page.locator('[data-upcoming="true"]');
    await expect(upcomingItem).toBeVisible();
    await expect(upcomingItem).toContainText('Kommende opgave');
  });

  test('manual reordering persists within one active bucket and keeps other buckets unchanged', async ({ page, apiHelper }) => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const high = await apiHelper.createTask({ title: 'Hoj prioritet', priority: 'high' });
    const alpha = await apiHelper.createTask({ title: 'Alpha', priority: 'default' });
    const beta = await apiHelper.createTask({ title: 'Beta', priority: 'default' });
    const upcoming = await apiHelper.createTask({ title: 'Senere', notBefore: tomorrow });

    await page.goto('/');

    await page.getByTestId(`task-drag-handle-${alpha.id}`).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByTestId(`task-drag-handle-${alpha.id}`).dragTo(page.getByTestId(`task-${beta.id}`));

    await expect(page.locator('[data-bucket] .text-white.text-sm')).toHaveText([
      'Hoj prioritet',
      'Beta',
      'Alpha',
    ]);

    await expect(page.getByTestId(`task-drag-handle-${upcoming.id}`)).toHaveCount(0);

    await page.reload();

    await expect(page.locator('[data-bucket] .text-white.text-sm')).toHaveText([
      'Hoj prioritet',
      'Beta',
      'Alpha',
    ]);
  });
});
