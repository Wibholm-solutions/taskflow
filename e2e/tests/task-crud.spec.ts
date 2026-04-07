import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';

async function swipeTaskToComplete(page: Page, title: string) {
  await page.locator('[data-priority]').filter({ hasText: title }).first().evaluate((taskCard) => {
    const interactive = taskCard.querySelector('.cursor-pointer');
    if (!interactive) {
      throw new Error('task card not swipeable');
    }

    const rect = interactive.getBoundingClientRect();
    const startX = rect.left + 24;
    const endX = startX + 140;
    const y = rect.top + rect.height / 2;

    const dispatchTouch = (type: 'touchstart' | 'touchmove' | 'touchend', x: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      const touches = type === 'touchend' ? [] : [{ clientX: x, clientY: y }];
      Object.defineProperty(event, 'touches', { value: touches });
      Object.defineProperty(event, 'changedTouches', {
        value: touches.length > 0 ? touches : [{ clientX: x, clientY: y }],
      });
      interactive.dispatchEvent(event);
    };

    dispatchTouch('touchstart', startX);
    dispatchTouch('touchmove', endX);
    dispatchTouch('touchend', endX);
  });
}

function taskTitle(page: Page, title: string) {
  return page.getByText(title, { exact: true });
}

test.describe('Task CRUD', () => {
  test('create a new task via modal', async ({ page }) => {
    await page.goto('/');

    // Open modal
    await page.getByLabel('Create task').click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Fill title and save
    await page.getByPlaceholder('What needs to be done?').fill('Buy milk');
    await page.getByRole('button', { name: 'Save' }).click();

    // Modal closes, task appears
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByText('Buy milk')).toBeVisible();
  });

  test('create task with all fields', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('Create task').click();
    await page.getByPlaceholder('What needs to be done?').fill('Important task');

    // Expand extra fields
    await page.getByText('More options').click();

    // Set description
    await page.locator('textarea').fill('A detailed description');

    // Set deadline
    await page.locator('input[type="date"]').fill('2026-12-31');

    // Set high priority
    await page.getByRole('button', { name: 'High' }).click();

    await page.getByRole('button', { name: 'Save' }).click();

    // Verify task appears with priority indicator
    await expect(page.getByText('Important task')).toBeVisible();
    await expect(page.locator('[data-priority="high"]')).toBeVisible();
  });

  test('edit an existing task', async ({ page, apiHelper }) => {
    await apiHelper.createTask({ title: 'Old title' });
    await page.goto('/');

    // Click on task to open edit modal
    await page.getByText('Old title').click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Change title
    const titleInput = page.getByPlaceholder('What needs to be done?');
    await titleInput.clear();
    await titleInput.fill('New title');
    await page.getByRole('button', { name: 'Save' }).click();

    // Verify updated
    await expect(page.getByText('New title')).toBeVisible();
    await expect(page.getByText('Old title')).not.toBeVisible();
  });

  test('delete a task', async ({ page, apiHelper }) => {
    await apiHelper.createTask({ title: 'Delete me' });
    await page.goto('/');
    await expect(page.getByText('Delete me')).toBeVisible();

    // Click to open edit modal, then delete
    await page.getByText('Delete me').click();
    await page.getByRole('button', { name: 'Delete' }).click();

    // Task gone
    await expect(page.getByText('Delete me')).not.toBeVisible();
  });

  test('empty title is rejected', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('Create task').click();

    // Try to save with empty title
    await page.getByRole('button', { name: 'Save' }).click();

    // Modal should still be open (save refused client-side)
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('cancel modal without saving', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('Create task').click();
    await page.getByPlaceholder('What needs to be done?').fill('Should not be saved');
    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByText('Should not be saved')).not.toBeVisible();
  });

  test('create, edit, and complete a parent task with subtasks', async ({ page, apiHelper }) => {
    await page.goto('/');

    await page.getByLabel('Create task').click();
    await page.getByPlaceholder('What needs to be done?').fill('Plan weekendtur');
    await page.getByRole('button', { name: 'Add subtask' }).click();
    await page.getByPlaceholder('New subtask...').nth(0).fill('Pack clothes');
    await page.getByRole('button', { name: 'Add subtask' }).click();
    await page.getByPlaceholder('New subtask...').nth(1).fill('Book hotel');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(taskTitle(page, 'Plan weekendtur')).toBeVisible();
    await expect(page.getByText('0/2')).toBeVisible();

    const createdTask = (await apiHelper.getTasks()).active.find((task: any) => task.title === 'Plan weekendtur');
    expect(createdTask).toBeTruthy();

    await page.getByText('Plan weekendtur').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.locator('input[value="Pack clothes"]').fill('Pack warm clothes');
    await page.getByLabel('Mark "Book hotel" as completed').check();
    await page.getByRole('button', { name: 'Add subtask' }).click();
    await page.getByPlaceholder('New subtask...').fill('Buy snacks');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('1/3')).toBeVisible();

    await page.getByText('Plan weekendtur').click();
    await expect(page.locator('input[value="Pack warm clothes"]')).toBeVisible();
    await expect(page.getByLabel('Mark "Book hotel" as completed')).toBeChecked();
    await expect(page.locator('input[value="Buy snacks"]')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();

    await swipeTaskToComplete(page, 'Plan weekendtur');
    await expect(
      page.getByText('"Plan weekendtur" has unfinished subtasks.')
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Complete all' })).toBeVisible();
    await expect(taskTitle(page, 'Plan weekendtur')).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(
      page.getByText('"Plan weekendtur" has unfinished subtasks.')
    ).not.toBeVisible();
    await expect(taskTitle(page, 'Plan weekendtur')).toBeVisible();

    await swipeTaskToComplete(page, 'Plan weekendtur');
    await page.getByRole('button', { name: 'Complete all' }).click();
    // Task enters undo delay queue — wait for snackbar to clear
    await expect(page.getByRole('button', { name: /undo/i })).not.toBeVisible({ timeout: 7000 });
    await expect(taskTitle(page, 'Plan weekendtur')).not.toBeVisible();
  });
});
