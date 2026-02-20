import { test, expect } from '../fixtures';

test.describe('Task sorting', () => {
  test('overdue tasks appear before tasks with future/no deadline', async ({ page, apiHelper }) => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    await apiHelper.createTask({ title: 'Fremtidig opgave', deadline: tomorrow });
    await apiHelper.createTask({ title: 'Forfalden opgave', deadline: yesterday });
    await apiHelper.createTask({ title: 'Ingen deadline' });

    await page.goto('/todo');

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

    await page.goto('/todo');

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

    await page.goto('/todo');

    // "Aktive" section
    await expect(page.getByText('Aktive')).toBeVisible();
    await expect(page.getByText('Aktiv opgave')).toBeVisible();

    // "Kommende" section
    await expect(page.getByRole('heading', { name: 'Kommende' })).toBeVisible();
    const upcomingItem = page.locator('[data-upcoming="true"]');
    await expect(upcomingItem).toBeVisible();
    await expect(upcomingItem).toContainText('Kommende opgave');
  });
});
