import { Hono } from 'hono';
import type { TaskService } from '../services/taskService';

const VALID_PRIORITIES = ['high', 'default', 'low'];
const VALID_RECURRENCE_TYPES = ['weekdays', 'days_after', 'months_after'];

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateRecurrenceRule(rule: any): string | null {
  if (!isObject(rule)) return 'invalid recurrence rule';
  if (!VALID_RECURRENCE_TYPES.includes(rule.type)) return 'invalid recurrence type';
  if (rule.type === 'weekdays' && (!Array.isArray(rule.days) || rule.days.length === 0)) {
    return 'weekdays requires days array';
  }
  if (rule.type === 'days_after' && (typeof rule.interval !== 'number' || rule.interval < 1)) {
    return 'days_after requires positive interval';
  }
  if (rule.type === 'months_after' && (typeof rule.interval !== 'number' || rule.interval < 1)) {
    return 'months_after requires positive interval';
  }

  return null;
}

function validateSubtaskInput(subtask: any): string | null {
  if (!isObject(subtask)) return 'invalid subtask';
  if (typeof subtask.title !== 'string') return 'subtask title is required';
  if (subtask.title.trim().length === 0) return 'subtask title is required';
  if (subtask.isCompleted !== undefined && typeof subtask.isCompleted !== 'boolean') {
    return 'subtask isCompleted must be boolean';
  }

  return null;
}

function validateCreateSubtasks(subtaskList: any): string | null {
  if (!Array.isArray(subtaskList)) return 'subtasks must be an array';

  for (const subtask of subtaskList) {
    const error = validateSubtaskInput(subtask);
    if (error) return error;
  }

  return null;
}

function validateSubtaskMutations(subtaskMutations: any): string | null {
  if (!isObject(subtaskMutations)) return 'subtasks must be an object';

  if (subtaskMutations.create !== undefined) {
    const error = validateCreateSubtasks(subtaskMutations.create);
    if (error) return error;
  }

  if (subtaskMutations.update !== undefined) {
    if (!Array.isArray(subtaskMutations.update)) return 'subtasks.update must be an array';
    for (const subtask of subtaskMutations.update) {
      if (!isObject(subtask) || typeof subtask.id !== 'string') return 'subtask update id is required';
      if (subtask.title !== undefined && typeof subtask.title !== 'string') {
        return 'subtask title must be a string';
      }
      if (subtask.title !== undefined && subtask.title.trim().length === 0) {
        return 'subtask title is required';
      }
      if (subtask.isCompleted !== undefined && typeof subtask.isCompleted !== 'boolean') {
        return 'subtask isCompleted must be boolean';
      }
    }
  }

  if (subtaskMutations.delete !== undefined) {
    if (!Array.isArray(subtaskMutations.delete)) return 'subtasks.delete must be an array';
    if (!subtaskMutations.delete.every((id: unknown) => typeof id === 'string')) {
      return 'subtasks.delete entries must be strings';
    }
  }

  return null;
}

function validateCreateInput(body: any): string | null {
  if (!isObject(body)) return 'invalid request body';
  if (!body.title || typeof body.title !== 'string') return 'title is required';
  if (body.title.length > 200) return 'title must be 200 chars or less';
  if (body.priority && !VALID_PRIORITIES.includes(body.priority)) return 'invalid priority';
  if (body.deadline && isNaN(Date.parse(body.deadline))) return 'invalid deadline date';
  if (body.notBefore !== undefined && body.notBefore !== null && isNaN(Date.parse(body.notBefore))) {
    return 'invalid notBefore date';
  }
  if (body.recurrenceRule) {
    const error = validateRecurrenceRule(body.recurrenceRule);
    if (error) return error;
  }
  if (body.subtasks !== undefined) return validateCreateSubtasks(body.subtasks);

  return null;
}

function validateUpdateInput(body: any): string | null {
  if (!isObject(body)) return 'invalid request body';
  if (body.title !== undefined && typeof body.title !== 'string') return 'title must be a string';
  if (body.title !== undefined && body.title.length > 200) return 'title must be 200 chars or less';
  if (body.priority !== undefined && !VALID_PRIORITIES.includes(body.priority)) return 'invalid priority';
  if (body.deadline !== undefined && body.deadline !== null && isNaN(Date.parse(body.deadline))) {
    return 'invalid deadline date';
  }
  if (body.notBefore !== undefined && body.notBefore !== null && isNaN(Date.parse(body.notBefore))) {
    return 'invalid notBefore date';
  }
  if (body.recurrenceRule !== undefined && body.recurrenceRule !== null) {
    const error = validateRecurrenceRule(body.recurrenceRule);
    if (error) return error;
  }
  if (body.subtasks !== undefined) return validateSubtaskMutations(body.subtasks);

  return null;
}

function validateCompleteInput(body: any): string | null {
  if (!isObject(body)) return 'invalid request body';
  if (
    body.completeRemainingSubtasks !== undefined &&
    body.completeRemainingSubtasks !== true
  ) {
    return 'completeRemainingSubtasks must be true when provided';
  }

  return null;
}

async function readJsonBody(
  c: any,
  options: { optional: boolean }
): Promise<{ body: Record<string, any> | null; error: string | null }> {
  const contentType = c.req.header('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return options.optional ? { body: {}, error: null } : { body: null, error: 'invalid request body' };
  }

  let rawBody = '';
  try {
    rawBody = await c.req.raw.text();
  } catch {
    return { body: null, error: 'invalid request body' };
  }

  if (rawBody.trim() === '') {
    return options.optional ? { body: {}, error: null } : { body: null, error: 'invalid request body' };
  }

  try {
    const parsed = JSON.parse(rawBody);
    return { body: isObject(parsed) ? parsed : null, error: null };
  } catch {
    return { body: null, error: 'invalid request body' };
  }
}

export function createTaskRoutes(service: TaskService) {
  const routes = new Hono();

  routes.get('/tasks', async (c) => {
    const tasks = await service.listTasks();
    return c.json(tasks);
  });

  routes.post('/tasks', async (c) => {
    const parsed = await readJsonBody(c, { optional: false });
    if (parsed.error || parsed.body === null) {
      return c.json({ error: parsed.error ?? 'invalid request body' }, 400);
    }
    const validationError = validateCreateInput(parsed.body);
    if (validationError) return c.json({ error: validationError }, 400);
    const task = await service.create(parsed.body);
    return c.json(task, 201);
  });

  routes.get('/tasks/:id', async (c) => {
    const task = await service.getById(c.req.param('id'));
    if (!task) return c.json({ error: 'not found' }, 404);
    return c.json(task);
  });

  routes.put('/tasks/:id', async (c) => {
    const parsed = await readJsonBody(c, { optional: false });
    if (parsed.error || parsed.body === null) {
      return c.json({ error: parsed.error ?? 'invalid request body' }, 400);
    }
    const validationError = validateUpdateInput(parsed.body);
    if (validationError) return c.json({ error: validationError }, 400);
    try {
      const task = await service.update(c.req.param('id'), parsed.body);
      return c.json(task);
    } catch (e: any) {
      if (e.message === 'not found') return c.json({ error: 'not found' }, 404);
      if (e.message === 'subtask does not belong to task') {
        return c.json({ error: 'subtask does not belong to task' }, 400);
      }
      throw e;
    }
  });

  routes.delete('/tasks/:id', async (c) => {
    await service.delete(c.req.param('id'));
    return c.body(null, 204);
  });

  routes.post('/tasks/:id/complete', async (c) => {
    const parsed = await readJsonBody(c, { optional: true });
    if (parsed.error || parsed.body === null) {
      return c.json({ error: parsed.error ?? 'invalid request body' }, 400);
    }
    const body = parsed.body;
    const validationError = validateCompleteInput(body);
    if (validationError) return c.json({ error: validationError }, 400);

    try {
      const result = await service.complete(c.req.param('id'), body);
      if (result.requiresConfirmation) {
        return c.json({ error: 'subtasks_confirmation_required' }, 409);
      }
      return c.json(result);
    } catch (e: any) {
      if (e.message === 'not found') return c.json({ error: 'not found' }, 404);
      throw e;
    }
  });

  return routes;
}
