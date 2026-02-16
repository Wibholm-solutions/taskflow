import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().default('default'),
  title: text('title').notNull(),
  description: text('description'),
  deadline: text('deadline'),
  priority: text('priority').notNull().default('default'),
  isCompleted: integer('is_completed').notNull().default(0),
  completedAt: text('completed_at'),
  notBefore: text('not_before'),
  recurrenceGroupId: text('recurrence_group_id'),
  recurrenceRule: text('recurrence_rule'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});
