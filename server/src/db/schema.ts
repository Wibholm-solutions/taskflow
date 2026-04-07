import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { DEFAULT_USER_ID } from '../middleware/auth.js';

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().default(DEFAULT_USER_ID),
  title: text('title').notNull(),
  description: text('description'),
  deadline: text('deadline'),
  priority: text('priority').notNull().default('default'),
  isCompleted: integer('is_completed').notNull().default(0),
  completedAt: text('completed_at'),
  notBefore: text('not_before'),
  recurrenceGroupId: text('recurrence_group_id'),
  recurrenceRule: text('recurrence_rule'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

export const subtasks = sqliteTable('subtasks', {
  id: text('id').primaryKey(),
  taskId: text('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  isCompleted: integer('is_completed').notNull().default(0),
  completedAt: text('completed_at'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});
