import { createMiddleware } from 'hono/factory';

// v1: hardcoded default user. Future: JWT validation.
export const authMiddleware = createMiddleware(async (c, next) => {
  const userId = c.req.header('X-User-Id') || 'default';
  c.set('userId', userId);
  await next();
});
