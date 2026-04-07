import { createMiddleware } from 'hono/factory';

export type AppEnv = {
  Variables: {
    userId: string;
  };
};

/**
 * Default user ID for single-user mode.
 *
 * TaskFlow is designed as a single-user application. The X-User-Id header
 * exists as a placeholder for future multi-user support but is NOT a real
 * authentication mechanism — any client can set any value.
 *
 * For production deployments, place the app behind a trusted reverse proxy
 * (e.g. Caddy, nginx) that handles authentication and injects a verified
 * user identity header before requests reach this middleware.
 */
export const DEFAULT_USER_ID = 'default';

export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const userId = c.req.header('X-User-Id') || DEFAULT_USER_ID;
  c.set('userId', userId);
  await next();
});
