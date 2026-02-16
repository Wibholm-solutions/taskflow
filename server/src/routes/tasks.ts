import { Hono } from 'hono';
import type { TaskService } from '../services/taskService';

const VALID_PRIORITIES = ['high', 'default', 'low'];

function validateCreateInput(body: any): string | null {
  if (!body.title || typeof body.title !== 'string') return 'title is required';
  if (body.title.length > 200) return 'title must be 200 chars or less';
  if (body.priority && !VALID_PRIORITIES.includes(body.priority)) return 'invalid priority';
  if (body.deadline && isNaN(Date.parse(body.deadline))) return 'invalid deadline date';
  if (body.recurrenceRule) {
    const r = body.recurrenceRule;
    if (!['weekdays', 'days_after', 'months_after'].includes(r.type)) return 'invalid recurrence type';
    if (r.type === 'weekdays' && (!Array.isArray(r.days) || r.days.length === 0)) return 'weekdays requires days array';
    if (r.type === 'days_after' && (typeof r.interval !== 'number' || r.interval < 1)) return 'days_after requires positive interval';
    if (r.type === 'months_after' && (typeof r.interval !== 'number' || r.interval < 1)) return 'months_after requires positive interval';
  }
  return null;
}

export function createTaskRoutes(service: TaskService) {
  const routes = new Hono();

  routes.get('/tasks', async (c) => {
    const tasks = await service.listTasks();
    return c.json(tasks);
  });

  routes.post('/tasks', async (c) => {
    const body = await c.req.json();
    const error = validateCreateInput(body);
    if (error) return c.json({ error }, 400);
    const task = await service.create(body);
    return c.json(task, 201);
  });

  routes.get('/tasks/:id', async (c) => {
    const task = await service.getById(c.req.param('id'));
    if (!task) return c.json({ error: 'not found' }, 404);
    return c.json(task);
  });

  routes.put('/tasks/:id', async (c) => {
    const body = await c.req.json();
    try {
      const task = await service.update(c.req.param('id'), body);
      return c.json(task);
    } catch (e: any) {
      if (e.message === 'not found') return c.json({ error: 'not found' }, 404);
      throw e;
    }
  });

  routes.delete('/tasks/:id', async (c) => {
    await service.delete(c.req.param('id'));
    return c.body(null, 204);
  });

  routes.post('/tasks/:id/complete', async (c) => {
    try {
      const result = await service.complete(c.req.param('id'));
      return c.json(result);
    } catch (e: any) {
      if (e.message === 'not found') return c.json({ error: 'not found' }, 404);
      throw e;
    }
  });

  return routes;
}
