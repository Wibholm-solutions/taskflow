import { and, asc, eq, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { subtasks, tasks } from '../db/schema';
import { calculateNextOccurrence } from './recurrenceService';
import type {
  CompleteTaskOptions,
  CompleteTaskResult,
  CreateTaskInput,
  Priority,
  SubtaskInput,
  SubtaskResponse,
  TaskResponse,
  UpdateTaskInput,
} from '../types';

type TaskRow = typeof tasks.$inferSelect;
type SubtaskRow = typeof subtasks.$inferSelect;

const PRIORITY_ORDER: Record<string, number> = { high: 0, default: 1, low: 2 };

function toSubtaskResponse(row: SubtaskRow): SubtaskResponse {
  return {
    id: row.id,
    taskId: row.taskId,
    title: row.title,
    isCompleted: row.isCompleted === 1,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toTaskResponse(row: TaskRow, childSubtasks: SubtaskRow[]): TaskResponse {
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
    subtasks: childSubtasks.map(toSubtaskResponse),
  };
}

function normalizeSubtaskTitle(title: string): string {
  return title.trim();
}

function buildSubtaskInsert(taskId: string, input: SubtaskInput, now: string) {
  const title = normalizeSubtaskTitle(input.title);
  if (!title) return null;

  const isCompleted = input.isCompleted === true ? 1 : 0;
  return {
    id: nanoid(),
    taskId,
    title,
    isCompleted,
    completedAt: isCompleted ? now : null,
    createdAt: now,
    updatedAt: now,
  };
}

function buildSubtaskInserts(taskId: string, inputs: SubtaskInput[] | undefined, now: string) {
  if (!inputs || inputs.length === 0) return [];

  const baseTime = new Date(now).getTime();
  return inputs
    .map((subtask, index) => {
      const subtaskTimestamp = new Date(baseTime + index).toISOString();
      return buildSubtaskInsert(taskId, subtask, subtaskTimestamp);
    })
    .filter((subtask): subtask is NonNullable<typeof subtask> => subtask !== null);
}

async function listSubtasks(db: any, taskIds: string[]): Promise<SubtaskRow[]> {
  if (taskIds.length === 0) return [];

  return db
    .select()
    .from(subtasks)
    .where(inArray(subtasks.taskId, taskIds))
    .orderBy(asc(subtasks.createdAt), asc(subtasks.id));
}

async function getTaskAggregate(db: any, id: string): Promise<TaskResponse | null> {
  const [taskRow] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!taskRow) return null;

  const subtaskRows = await listSubtasks(db, [id]);
  return toTaskResponse(taskRow, subtaskRows);
}

async function getTaskAggregates(db: any, taskRows: TaskRow[]): Promise<TaskResponse[]> {
  if (taskRows.length === 0) return [];

  const subtaskRows = await listSubtasks(
    db,
    taskRows.map((row) => row.id)
  );
  const subtasksByTaskId = new Map<string, SubtaskRow[]>();

  for (const row of subtaskRows) {
    const current = subtasksByTaskId.get(row.taskId) ?? [];
    current.push(row);
    subtasksByTaskId.set(row.taskId, current);
  }

  return taskRows.map((row) => toTaskResponse(row, subtasksByTaskId.get(row.id) ?? []));
}

export class TaskService {
  constructor(private db: any) {}

  async create(input: CreateTaskInput): Promise<TaskResponse> {
    const id = nanoid();
    const hasRecurrence = !!input.recurrenceRule;
    const recurrenceGroupId = hasRecurrence ? nanoid() : null;
    const now = new Date().toISOString();

    this.db.transaction((tx: any) => {
      tx.insert(tasks).values({
        id,
        title: input.title,
        description: input.description ?? null,
        deadline: input.deadline ?? null,
        priority: input.priority ?? 'default',
        notBefore: input.notBefore ?? null,
        recurrenceGroupId,
        recurrenceRule: input.recurrenceRule ? JSON.stringify(input.recurrenceRule) : null,
        createdAt: now,
        updatedAt: now,
      }).run();

      const newSubtasks = buildSubtaskInserts(id, input.subtasks, now);

      if (newSubtasks.length > 0) {
        tx.insert(subtasks).values(newSubtasks).run();
      }
    });

    return (await getTaskAggregate(this.db, id))!;
  }

  async getById(id: string): Promise<TaskResponse | null> {
    return getTaskAggregate(this.db, id);
  }

  async listTasks(): Promise<{ active: TaskResponse[]; upcoming: TaskResponse[] }> {
    const rows = await this.db
      .select()
      .from(tasks)
      .where(eq(tasks.isCompleted, 0));
    const taskResponses = await getTaskAggregates(this.db, rows);

    const today = new Date().toISOString().split('T')[0];
    const active: TaskResponse[] = [];
    const upcoming: TaskResponse[] = [];

    for (const task of taskResponses) {
      if (task.notBefore && task.notBefore > today) {
        upcoming.push(task);
      } else {
        active.push(task);
      }
    }

    active.sort((a, b) => {
      const aDue = a.deadline && a.deadline <= today;
      const bDue = b.deadline && b.deadline <= today;
      if (aDue && bDue) return a.deadline!.localeCompare(b.deadline!);
      if (aDue && !bDue) return -1;
      if (!aDue && bDue) return 1;
      return (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1);
    });

    upcoming.sort((a, b) => (a.notBefore ?? '').localeCompare(b.notBefore ?? ''));

    return { active, upcoming };
  }

  async update(id: string, input: UpdateTaskInput): Promise<TaskResponse> {
    const existing = await getTaskAggregate(this.db, id);
    if (!existing) throw new Error('not found');

    const now = new Date().toISOString();

    this.db.transaction((tx: any) => {
      const updates: Record<string, any> = {
        updatedAt: now,
      };

      if (input.title !== undefined) updates.title = input.title;
      if (input.description !== undefined) updates.description = input.description;
      if (input.deadline !== undefined) updates.deadline = input.deadline;
      if (input.priority !== undefined) updates.priority = input.priority;
      if (input.notBefore !== undefined) updates.notBefore = input.notBefore;
      if (input.recurrenceRule !== undefined) {
        updates.recurrenceRule = input.recurrenceRule ? JSON.stringify(input.recurrenceRule) : null;
      }

      tx.update(tasks).set(updates).where(eq(tasks.id, id)).run();

      if (!input.subtasks) return;

      const updateIds = input.subtasks.update?.map((subtask) => subtask.id) ?? [];
      const deleteIds = input.subtasks.delete ?? [];
      const touchedIds = [...new Set([...updateIds, ...deleteIds])];

      if (touchedIds.length > 0) {
        const existingSubtasks = tx
          .select()
          .from(subtasks)
          .where(inArray(subtasks.id, touchedIds))
          .all();

        if (existingSubtasks.length !== touchedIds.length) {
          throw new Error('subtask does not belong to task');
        }

        for (const subtask of existingSubtasks) {
          if (subtask.taskId !== id) {
            throw new Error('subtask does not belong to task');
          }
        }
      }

      for (const subtask of input.subtasks.update ?? []) {
        const subtaskUpdates: Record<string, any> = { updatedAt: now };
        if (subtask.title !== undefined) {
          subtaskUpdates.title = normalizeSubtaskTitle(subtask.title);
        }
        if (subtask.isCompleted !== undefined) {
          subtaskUpdates.isCompleted = subtask.isCompleted ? 1 : 0;
          subtaskUpdates.completedAt = subtask.isCompleted ? now : null;
        }

        tx.update(subtasks).set(subtaskUpdates).where(eq(subtasks.id, subtask.id)).run();
      }

      const newSubtasks = buildSubtaskInserts(id, input.subtasks.create, now);

      if (newSubtasks.length > 0) {
        tx.insert(subtasks).values(newSubtasks).run();
      }

      if (deleteIds.length > 0) {
        tx.delete(subtasks).where(inArray(subtasks.id, deleteIds)).run();
      }
    });

    return (await getTaskAggregate(this.db, id))!;
  }

  async delete(id: string): Promise<void> {
    this.db.transaction((tx: any) => {
      tx.delete(subtasks).where(eq(subtasks.taskId, id)).run();
      tx.delete(tasks).where(eq(tasks.id, id)).run();
    });
  }

  async complete(id: string, options: CompleteTaskOptions = {}): Promise<CompleteTaskResult> {
    const existing = await getTaskAggregate(this.db, id);
    if (!existing) throw new Error('not found');

    const openSubtasks = existing.subtasks.filter((subtask) => !subtask.isCompleted);
    if (openSubtasks.length > 0 && !options.completeRemainingSubtasks) {
      return {
        completed: null,
        nextInstance: null,
        requiresConfirmation: true,
      };
    }

    const now = new Date().toISOString();
    const completedDate = now.split('T')[0];
    let nextInstanceId: string | null = null;

    this.db.transaction((tx: any) => {
      if (openSubtasks.length > 0) {
        tx.update(subtasks)
          .set({ isCompleted: 1, completedAt: now, updatedAt: now })
          .where(and(eq(subtasks.taskId, id), eq(subtasks.isCompleted, 0)))
          .run();
      }

      tx.update(tasks)
        .set({ isCompleted: 1, completedAt: now, updatedAt: now })
        .where(eq(tasks.id, id))
        .run();

      if (!existing.recurrenceRule || !existing.recurrenceGroupId) {
        return;
      }

      const nextDate = calculateNextOccurrence(existing.recurrenceRule, completedDate);
      const existingInstances = tx
        .select()
        .from(tasks)
        .where(and(eq(tasks.recurrenceGroupId, existing.recurrenceGroupId), eq(tasks.isCompleted, 0)))
        .all();

      if (existingInstances.length > 0) {
        nextInstanceId = existingInstances[0].id;
        tx.update(tasks)
          .set({
            notBefore: nextDate,
            deadline: existing.deadline ? nextDate : null,
            updatedAt: now,
          })
          .where(eq(tasks.id, existingInstances[0].id))
          .run();
        return;
      }

      nextInstanceId = nanoid();
      tx.insert(tasks).values({
        id: nextInstanceId,
        title: existing.title,
        description: existing.description,
        deadline: existing.deadline ? nextDate : null,
        priority: existing.priority,
        notBefore: nextDate,
        recurrenceGroupId: existing.recurrenceGroupId,
        recurrenceRule: JSON.stringify(existing.recurrenceRule),
        createdAt: now,
        updatedAt: now,
      }).run();
    });

    return {
      completed: await getTaskAggregate(this.db, id),
      nextInstance: nextInstanceId ? await getTaskAggregate(this.db, nextInstanceId) : null,
      requiresConfirmation: false,
    };
  }
}
