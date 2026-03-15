import { test, expect } from '../fixtures';

test.describe('Task CRUD', () => {
  test('create a new task via modal', async ({ page }) => {
    await page.goto('/todo');

    // Open modal
    await page.getByLabel('Opret opgave').click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Fill title and save
    await page.getByPlaceholder('Hvad skal du?').fill('Køb mælk');
    await page.getByRole('button', { name: 'Gem' }).click();

    // Modal closes, task appears
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByText('Køb mælk')).toBeVisible();
  });

  test('create task with all fields', async ({ page }) => {
    await page.goto('/todo');

    await page.getByLabel('Opret opgave').click();
    await page.getByPlaceholder('Hvad skal du?').fill('Vigtig opgave');

    // Expand extra fields
    await page.getByText('Flere indstillinger').click();

    // Set description
    await page.locator('textarea').fill('En detaljeret beskrivelse');

    // Set deadline
    await page.locator('input[type="date"]').fill('2026-12-31');

    // Set high priority
    await page.getByRole('button', { name: 'Høj' }).click();

    await page.getByRole('button', { name: 'Gem' }).click();

    // Verify task appears with priority indicator
    await expect(page.getByText('Vigtig opgave')).toBeVisible();
    await expect(page.locator('[data-priority="high"]')).toBeVisible();
  });

  test('edit an existing task', async ({ page, apiHelper }) => {
    await apiHelper.createTask({ title: 'Gammel titel' });
    await page.goto('/todo');

    // Click on task to open edit modal
    await page.getByText('Gammel titel').click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Change title
    const titleInput = page.getByPlaceholder('Hvad skal du?');
    await titleInput.clear();
    await titleInput.fill('Ny titel');
    await page.getByRole('button', { name: 'Gem' }).click();

    // Verify updated
    await expect(page.getByText('Ny titel')).toBeVisible();
    await expect(page.getByText('Gammel titel')).not.toBeVisible();
  });

  test('delete a task', async ({ page, apiHelper }) => {
    await apiHelper.createTask({ title: 'Slet mig' });
    await page.goto('/todo');
    await expect(page.getByText('Slet mig')).toBeVisible();

    // Click to open edit modal, then delete
    await page.getByText('Slet mig').click();
    await page.getByRole('button', { name: 'Slet' }).click();

    // Task gone
    await expect(page.getByText('Slet mig')).not.toBeVisible();
  });

  test('empty title is rejected', async ({ page }) => {
    await page.goto('/todo');

    await page.getByLabel('Opret opgave').click();

    // Try to save with empty title
    await page.getByRole('button', { name: 'Gem' }).click();

    // Modal should still be open (save refused client-side)
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('cancel modal without saving', async ({ page }) => {
    await page.goto('/todo');

    await page.getByLabel('Opret opgave').click();
    await page.getByPlaceholder('Hvad skal du?').fill('Skal ikke gemmes');
    await page.getByRole('button', { name: 'Annuller' }).click();

    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByText('Skal ikke gemmes')).not.toBeVisible();
  });

  test('create, edit, and complete a parent task with subtasks', async ({ page, apiHelper }) => {
    await page.goto('/todo');

    await page.getByLabel('Opret opgave').click();
    await page.getByPlaceholder('Hvad skal du?').fill('Plan weekendtur');
    await page.getByRole('button', { name: 'Tilføj underopgave' }).click();
    await page.getByPlaceholder('Ny underopgave').nth(0).fill('Pak tøj');
    await page.getByRole('button', { name: 'Tilføj underopgave' }).click();
    await page.getByPlaceholder('Ny underopgave').nth(1).fill('Book hotel');
    await page.getByRole('button', { name: 'Gem' }).click();

    await expect(page.getByText('Plan weekendtur')).toBeVisible();
    await expect(page.getByText('0/2')).toBeVisible();

    const createdTask = (await apiHelper.getTasks()).active.find((task: any) => task.title === 'Plan weekendtur');
    expect(createdTask).toBeTruthy();

    await page.getByText('Plan weekendtur').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.locator('input[value="Pak tøj"]').fill('Pak varmt tøj');
    await page.getByLabel('Mark "Book hotel" as completed').check();
    await page.getByRole('button', { name: 'Tilføj underopgave' }).click();
    await page.getByPlaceholder('Ny underopgave').fill('Køb snacks');
    await page.getByRole('button', { name: 'Gem' }).click();

    await expect(page.getByText('1/3')).toBeVisible();

    await page.getByText('Plan weekendtur').click();
    await expect(page.locator('input[value="Pak varmt tøj"]')).toBeVisible();
    await expect(page.getByLabel('Mark "Book hotel" as completed')).toBeChecked();
    await expect(page.locator('input[value="Køb snacks"]')).toBeVisible();
    await page.getByRole('button', { name: 'Annuller' }).click();

    await expect(apiHelper.completeTask(createdTask.id)).rejects.toThrow('completeTask failed: 409');
    await page.reload();
    await expect(page.getByText('Plan weekendtur')).toBeVisible();

    await apiHelper.completeTask(createdTask.id, { completeRemainingSubtasks: true });
    await page.reload();
    await expect(page.getByText('Plan weekendtur')).not.toBeVisible();
  });
});
