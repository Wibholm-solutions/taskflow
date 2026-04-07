import { test, expect } from '../fixtures';

test.describe('Task completion', () => {
  test('complete task via API and verify it disappears', async ({ page, apiHelper }) => {
    const task = await apiHelper.createTask({ title: 'Færdiggør mig' });
    await page.goto('/');
    await expect(page.getByText('Færdiggør mig')).toBeVisible();

    // Complete via API (swipe is unreliable in Playwright)
    await apiHelper.completeTask(task.id);
    await page.reload();

    await expect(page.getByText('Færdiggør mig')).not.toBeVisible();
  });

  test('recurring task (days_after): new instance created on completion', async ({ page, apiHelper }) => {
    const task = await apiHelper.createTask({
      title: 'Gentag hver 7. dag',
      recurrenceRule: { type: 'days_after', interval: 7 },
    });
    await page.goto('/');
    await expect(page.getByText('Gentag hver 7. dag')).toBeVisible();

    // Complete → should create next instance
    const result = await apiHelper.completeTask(task.id);
    expect(result.nextInstance).toBeTruthy();
    expect(result.nextInstance.title).toBe('Gentag hver 7. dag');

    await page.reload();
    // The next instance should be visible (possibly in upcoming)
    await expect(page.getByText('Gentag hver 7. dag')).toBeVisible();
  });

  test('recurring task (weekdays): new instance created on completion', async ({ page, apiHelper }) => {
    const task = await apiHelper.createTask({
      title: 'Mandag-opgave',
      recurrenceRule: { type: 'weekdays', days: [1] }, // Monday
    });

    const result = await apiHelper.completeTask(task.id);
    expect(result.nextInstance).toBeTruthy();
    expect(result.nextInstance.recurrenceRule.type).toBe('weekdays');
  });

  test('recurring task (months_after): new instance created on completion', async ({ page, apiHelper }) => {
    const task = await apiHelper.createTask({
      title: 'Månedlig opgave',
      recurrenceRule: { type: 'months_after', interval: 1 },
    });

    const result = await apiHelper.completeTask(task.id);
    expect(result.nextInstance).toBeTruthy();
    expect(result.nextInstance.recurrenceRule.type).toBe('months_after');
  });
});
