import { and, asc, eq, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { subtasks, tasks } from '../db/schema';
import { executeCompletion } from './completionOrchestrator';
import { normalizeDate, normalizeSubtaskTitle, buildSubtaskInserts } from './helpers';
export { SubtasksConfirmationRequiredError } from './completionOrchestrator';
import type {
  CompleteTaskOptions,
  CompleteTaskResult,
  CreateTaskInput,
  Priority,
  ReorderTasksInput,
  SubtaskResponse,
  TaskResponse,
  UpdateTaskInput,
} from '../types';

type TaskRow = typeof tasks.$inferSelect;
type SubtaskRow = typeof subtasks.$inferSelect;

const PRIORITY_ORDER: Record<string, number> = { high: 0, default: 1, low: 2 };

function compareUrgencyAndPriority(a: TaskResponse, b: TaskResponse, today: string): number {
  const aDue = Boolean(a.deadline && a.deadline <= today);
  const bDue = Boolean(b.deadline && b.deadline <= today);
  if (aDue && bDue) {
    const deadlineComparison = a.deadline!.localeCompare(b.deadline!);
    if (deadlineComparison !== 0) return deadlineComparison;
  } else if (aDue !== bDue) {
    return aDue ? -1 : 1;
  }

  return (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1);
}

type BucketTaskState = {
  id: string;
  deadline: string | null;
  priority: Priority;
  isCompleted: boolean;
  notBefore: string | null;
  sortOrder: number;
  createdAt: string;
};

function toBucketTaskState(task: BucketTaskState): BucketTaskState {
  return {
    ...task,
    deadline: normalizeDate(task.deadline),
    notBefore: normalizeDate(task.notBefore),
  };
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function getBucketKey(task: BucketTaskState, today: string): string | null {
  if (task.isCompleted) return null;
  if (task.notBefore && task.notBefore > today) return null;

  const urgency = task.deadline && task.deadline <= today ? `due:${task.deadline}` : 'active';
  return `${urgency}:${task.priority}`;
}

function compareBucketTaskState(a: BucketTaskState, b: BucketTaskState): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  if (a.createdAt !== b.createdAt) return a.createdAt.localeCompare(b.createdAt);
  return a.id.localeCompare(b.id);
}

function toStateFromRow(row: TaskRow): BucketTaskState {
  return toBucketTaskState({
    id: row.id,
    deadline: row.deadline,
    priority: row.priority as Priority,
    isCompleted: row.isCompleted === 1,
    notBefore: row.notBefore,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
  });
}

async function nextSortOrderForBucket(
  db: any,
  task: Omit<BucketTaskState, 'sortOrder' | 'createdAt'>,
  userId: string
): Promise<number> {
  const today = getToday();
  const bucketKey = getBucketKey(
    toBucketTaskState({
      ...task,
      sortOrder: 0,
      createdAt: '',
    }),
    today
  );

  if (!bucketKey) return 0;

  const rows = await db.select().from(tasks).where(and(eq(tasks.isCompleted, 0), eq(tasks.userId, userId)));
  const bucketRows = rows
    .map((row: TaskRow) => toStateFromRow(row))
    .filter((row) => getBucketKey(row, today) === bucketKey);

  if (bucketRows.length === 0) return 0;
  return Math.max(...bucketRows.map((row) => row.sortOrder)) + 1;
}

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
    deadline: normalizeDate(row.deadline),
    priority: row.priority as Priority,
    isCompleted: row.isCompleted === 1,
    completedAt: row.completedAt,
    notBefore: normalizeDate(row.notBefore),
    recurrenceGroupId: row.recurrenceGroupId,
    recurrenceRule: row.recurrenceRule ? JSON.parse(row.recurrenceRule) : null,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    subtasks: childSubtasks.map(toSubtaskResponse),
  };
}

async function listSubtasks(db: any, taskIds: string[]): Promise<SubtaskRow[]> {
  if (taskIds.length === 0) return [];

  return db
    .select()
    .from(subtasks)
    .where(inArray(subtasks.taskId, taskIds))
    .orderBy(asc(subtasks.createdAt), asc(subtasks.id));
}

async function getTaskAggregate(db: any, id: string, userId: string): Promise<TaskResponse | null> {
  const [taskRow] = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
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
  constructor(private db: BetterSQLite3Database<any>) {}

  async create(input: CreateTaskInput, userId: string): Promise<TaskResponse> {
    const id = nanoid();
    const hasRecurrence = !!input.recurrenceRule;
    const recurrenceGroupId = hasRecurrence ? nanoid() : null;
    const now = new Date().toISOString();
    const normalizedDeadline = normalizeDate(input.deadline);
    const normalizedNotBefore = normalizeDate(input.notBefore);
    const sortOrder = await nextSortOrderForBucket(this.db, {
      id,
      deadline: normalizedDeadline,
      priority: input.priority ?? 'default',
      isCompleted: false,
      notBefore: normalizedNotBefore,
    }, userId);

    this.db.transaction((tx: any) => {
      tx.insert(tasks).values({
        id,
        userId,
        title: input.title,
        description: input.description ?? null,
        deadline: normalizedDeadline,
        priority: input.priority ?? 'default',
        notBefore: normalizedNotBefore,
        recurrenceGroupId,
        recurrenceRule: input.recurrenceRule ? JSON.stringify(input.recurrenceRule) : null,
        sortOrder,
        createdAt: now,
        updatedAt: now,
      }).run();

      const newSubtasks = buildSubtaskInserts(id, input.subtasks, now);

      if (newSubtasks.length > 0) {
        tx.insert(subtasks).values(newSubtasks).run();
      }
    });

    return (await getTaskAggregate(this.db, id, userId))!;
  }

  async getById(id: string, userId: string): Promise<TaskResponse | null> {
    return getTaskAggregate(this.db, id, userId);
  }

  async listTasks(userId: string): Promise<{ active: TaskResponse[]; upcoming: TaskResponse[] }> {
    const rows = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.isCompleted, 0), eq(tasks.userId, userId)));
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
      const bucketDiff = compareUrgencyAndPriority(a, b, today);
      if (bucketDiff !== 0) return bucketDiff;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      if (a.createdAt !== b.createdAt) return a.createdAt.localeCompare(b.createdAt);
      return a.id.localeCompare(b.id);
    });

    upcoming.sort((a, b) => (a.notBefore ?? '').localeCompare(b.notBefore ?? ''));

    return { active, upcoming };
  }

  async update(id: string, input: UpdateTaskInput, userId: string): Promise<TaskResponse> {
    const existing = await getTaskAggregate(this.db, id, userId);
    if (!existing) throw new Error('not found');

    const now = new Date().toISOString();
    const today = getToday();
    const nextState = toBucketTaskState({
      id: existing.id,
      deadline: input.deadline !== undefined ? normalizeDate(input.deadline) : existing.deadline,
      priority: input.priority ?? existing.priority,
      isCompleted: existing.isCompleted,
      notBefore: input.notBefore !== undefined ? normalizeDate(input.notBefore) : existing.notBefore,
      sortOrder: existing.sortOrder,
      createdAt: existing.createdAt,
    });
    const existingBucket = getBucketKey(toBucketTaskState(existing), today);
    const nextBucket = getBucketKey(nextState, today);
    const nextSortOrder =
      existingBucket !== nextBucket && nextBucket
        ? await nextSortOrderForBucket(this.db, nextState, userId)
        : existing.sortOrder;

    this.db.transaction((tx: any) => {
      const updates: Record<string, any> = {
        updatedAt: now,
      };

      if (input.title !== undefined) updates.title = input.title;
      if (input.description !== undefined) updates.description = input.description;
      if (input.deadline !== undefined) updates.deadline = normalizeDate(input.deadline);
      if (input.priority !== undefined) updates.priority = input.priority;
      if (input.notBefore !== undefined) updates.notBefore = normalizeDate(input.notBefore);
      if (input.recurrenceRule !== undefined) {
        updates.recurrenceRule = input.recurrenceRule ? JSON.stringify(input.recurrenceRule) : null;
        if (input.recurrenceRule && !existing.recurrenceGroupId) {
          updates.recurrenceGroupId = nanoid();
        }
      }
      if (existingBucket !== nextBucket && nextBucket) {
        updates.sortOrder = nextSortOrder;
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

    return (await getTaskAggregate(this.db, id, userId))!;
  }

  async delete(id: string, userId: string): Promise<void> {
    this.db.transaction((tx: any) => {
      const taskRow = tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
        .get();
      if (!taskRow) return;
      tx.delete(subtasks).where(eq(subtasks.taskId, id)).run();
      tx.delete(tasks).where(eq(tasks.id, id)).run();
    });
  }

  async complete(id: string, options: CompleteTaskOptions = {}, userId: string): Promise<CompleteTaskResult> {
    const existing = await getTaskAggregate(this.db, id, userId);
    if (!existing) throw new Error('not found');

    const now = new Date().toISOString();
    let nextInstanceId: string | null = null;

    this.db.transaction((tx: any) => {
      const result = executeCompletion(existing, options, { tx, userId, now });
      nextInstanceId = result.nextInstanceId;
    });

    return {
      completed: (await getTaskAggregate(this.db, id, userId))!,
      nextInstance: nextInstanceId ? await getTaskAggregate(this.db, nextInstanceId, userId) : null,
    };
  }

  async reorder(taskIds: ReorderTasksInput['taskIds'], userId: string): Promise<void> {
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      throw new Error('invalid reorder payload');
    }

    if (new Set(taskIds).size !== taskIds.length) {
      throw new Error('invalid reorder payload');
    }

    const rows = await this.db.select().from(tasks).where(and(eq(tasks.isCompleted, 0), eq(tasks.userId, userId)));
    const states = rows.map((row: TaskRow) => toStateFromRow(row));
    const stateById = new Map(states.map((state) => [state.id, state]));
    const selectedStates = taskIds.map((id) => stateById.get(id)).filter(Boolean) as BucketTaskState[];

    if (selectedStates.length !== taskIds.length) {
      throw new Error('invalid reorder payload');
    }

    const today = getToday();
    const bucketKey = getBucketKey(selectedStates[0], today);
    if (!bucketKey || selectedStates.some((state) => getBucketKey(state, today) !== bucketKey)) {
      throw new Error('invalid reorder payload');
    }

    const fullBucket = states
      .filter((state) => getBucketKey(state, today) === bucketKey)
      .sort(compareBucketTaskState);

    if (fullBucket.length !== taskIds.length) {
      throw new Error('invalid reorder payload');
    }

    if (fullBucket.some((state) => !taskIds.includes(state.id))) {
      throw new Error('invalid reorder payload');
    }

    const now = new Date().toISOString();
    this.db.transaction((tx: any) => {
      taskIds.forEach((taskId, index) => {
        tx.update(tasks)
          .set({ sortOrder: index, updatedAt: now })
          .where(eq(tasks.id, taskId))
          .run();
      });
    });
  }
}
