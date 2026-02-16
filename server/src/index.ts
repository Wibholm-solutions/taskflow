import { Hono } from 'hono';
import { serve } from '@hono/node-server';

const app = new Hono();
app.get('/todo/api/health', (c) => c.json({ status: 'ok' }));

const port = parseInt(process.env.PORT || '3000');
console.log(`Server running on port ${port}`);
serve({ fetch: app.fetch, port });
