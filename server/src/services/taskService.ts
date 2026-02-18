import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { tasks } from '../db/schema';
import { calculateNextOccurrence } from './recurrenceService';
import type { CreateTaskInput, UpdateTaskInput, TaskResponse, RecurrenceRule, Priority } from '../types';

type DrizzleDb = Parameters<typeof tasks._.columns.id.mapFromDriverValue> extends never[]
  ? any
  : any;

const PRIORITY_ORDER: Record<string, number> = { high: 0, default: 1, low: 2 };

function toResponse(row: typeof tasks.$inferSelect): TaskResponse {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    deadline: row.deadline,
    priority: row.priority as Priority,
    isCompleted: row.isCompleted === 1,
    completedAt: row.completedAt,
    notBefore: row.notBefore,
    recurrenceGroupId: row.recurrenceGroupId,
    recurrenceRule: row.recurrenceRule ? JSON.parse(row.recurrenceRule) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class TaskService {
  constructor(private db: any) {}

  async create(input: CreateTaskInput): Promise<TaskResponse> {
    const id = nanoid();
    const hasRecurrence = !!input.recurrenceRule;
    const recurrenceGroupId = hasRecurrence ? nanoid() : null;

    const values = {
      id,
      title: input.title,
      description: input.description ?? null,
      deadline: input.deadline ?? null,
      priority: input.priority ?? 'default',
      notBefore: input.notBefore ?? null,
      recurrenceGroupId,
      recurrenceRule: input.recurrenceRule ? JSON.stringify(input.recurrenceRule) : null,
    };

    await this.db.insert(tasks).values(values);
    const [row] = await this.db.select().from(tasks).where(eq(tasks.id, id));
    return toResponse(row);
  }

  async getById(id: string): Promise<TaskResponse | null> {
    const [row] = await this.db.select().from(tasks).where(eq(tasks.id, id));
    return row ? toResponse(row) : null;
  }

  async listTasks(): Promise<{ active: TaskResponse[]; upcoming: TaskResponse[] }> {
    const rows = await this.db
      .select()
      .from(tasks)
      .where(eq(tasks.isCompleted, 0));

    const today = new Date().toISOString().split('T')[0];
    const active: TaskResponse[] = [];
    const upcoming: TaskResponse[] = [];

    for (const row of rows) {
      const task = toResponse(row);
      if (task.notBefore && task.notBefore > today) {
        upcoming.push(task);
      } else {
        active.push(task);
      }
    }

    // Sort active: due/overdue deadlines first (ASC), then priority
    // Future deadlines don't get sorting priority - they sort by priority like tasks without deadline
    active.sort((a, b) => {
      const aDue = a.deadline && a.deadline <= today;
      const bDue = b.deadline && b.deadline <= today;
      if (aDue && bDue) return a.deadline!.localeCompare(b.deadline!);
      if (aDue && !bDue) return -1;
      if (!aDue && bDue) return 1;
      return (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1);
    });

    // Sort upcoming by notBefore ASC
    upcoming.sort((a, b) => (a.notBefore ?? '').localeCompare(b.notBefore ?? ''));

    return { active, upcoming };
  }

  async update(id: string, input: UpdateTaskInput): Promise<TaskResponse> {
    const existing = await this.getById(id);
    if (!existing) throw new Error('not found');

    const updates: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };

    if (input.title !== undefined) updates.title = input.title;
    if (input.description !== undefined) updates.description = input.description;
    if (input.deadline !== undefined) updates.deadline = input.deadline;
    if (input.priority !== undefined) updates.priority = input.priority;
    if (input.notBefore !== undefined) updates.notBefore = input.notBefore;
    if (input.recurrenceRule !== undefined) {
      updates.recurrenceRule = input.recurrenceRule ? JSON.stringify(input.recurrenceRule) : null;
    }

    await this.db.update(tasks).set(updates).where(eq(tasks.id, id));
    const [row] = await this.db.select().from(tasks).where(eq(tasks.id, id));
    return toResponse(row);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(tasks).where(eq(tasks.id, id));
  }

  async complete(id: string): Promise<{ completed: TaskResponse; nextInstance: TaskResponse | null }> {
    const existing = await this.getById(id);
    if (!existing) throw new Error('not found');

    const now = new Date().toISOString();
    const completedDate = now.split('T')[0];

    await this.db
      .update(tasks)
      .set({ isCompleted: 1, completedAt: now, updatedAt: now })
      .where(eq(tasks.id, id));

    const [completedRow] = await this.db.select().from(tasks).where(eq(tasks.id, id));
    const completed = toResponse(completedRow);

    if (!existing.recurrenceRule || !existing.recurrenceGroupId) {
      return { completed, nextInstance: null };
    }

    const nextDate = calculateNextOccurrence(existing.recurrenceRule, completedDate);

    // Check for existing uncompleted instance in same group
    const existingInstances = await this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.recurrenceGroupId, existing.recurrenceGroupId),
          eq(tasks.isCompleted, 0)
        )
      );

    if (existingInstances.length > 0) {
      // Update existing instance
      const existingInstance = existingInstances[0];
      await this.db
        .update(tasks)
        .set({
          notBefore: nextDate,
          deadline: existing.deadline ? nextDate : null,
          updatedAt: now,
        })
        .where(eq(tasks.id, existingInstance.id));

      const [updatedRow] = await this.db.select().from(tasks).where(eq(tasks.id, existingInstance.id));
      return { completed, nextInstance: toResponse(updatedRow) };
    }

    // Create new instance
    const nextId = nanoid();
    await this.db.insert(tasks).values({
      id: nextId,
      title: existing.title,
      description: existing.description,
      deadline: existing.deadline ? nextDate : null,
      priority: existing.priority,
      notBefore: nextDate,
      recurrenceGroupId: existing.recurrenceGroupId,
      recurrenceRule: JSON.stringify(existing.recurrenceRule),
    });

    const [nextRow] = await this.db.select().from(tasks).where(eq(tasks.id, nextId));
    return { completed, nextInstance: toResponse(nextRow) };
  }
}
