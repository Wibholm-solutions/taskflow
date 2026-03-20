import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { subtasks, tasks } from '../db/schema';
import { calculateNextOccurrence } from './recurrenceService';
import type { TaskResponse } from '../types';

export class SubtasksConfirmationRequiredError extends Error {
  readonly code = 'subtasks_confirmation_required' as const;

  constructor() {
    super('Open subtasks require confirmation before completing');
    this.name = 'SubtasksConfirmationRequiredError';
  }
}

interface ExecuteCompletionOptions {
  completeRemainingSubtasks?: boolean;
}

interface ExecuteCompletionContext {
  tx: any;
  userId: string;
  now: string;
}

function normalizeDate(value?: string | null): string | null {
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 10);
}

function normalizeSubtaskTitle(title: string): string {
  return title.trim();
}

function buildSubtaskInsert(taskId: string, input: { title: string; isCompleted?: boolean }, now: string) {
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

function buildSubtaskInserts(taskId: string, inputs: { title: string; isCompleted?: boolean }[], now: string) {
  const baseTime = new Date(now).getTime();
  return inputs
    .map((subtask, index) => {
      const subtaskTimestamp = new Date(baseTime + index).toISOString();
      return buildSubtaskInsert(taskId, subtask, subtaskTimestamp);
    })
    .filter((subtask): subtask is NonNullable<typeof subtask> => subtask !== null);
}

function buildRecurringSubtaskInserts(
  taskId: string,
  existingSubtasks: TaskResponse['subtasks'],
  now: string
) {
  return buildSubtaskInserts(
    taskId,
    existingSubtasks.map((subtask) => ({
      title: subtask.title,
      isCompleted: false,
    })),
    now
  );
}

export function executeCompletion(
  task: TaskResponse,
  options: ExecuteCompletionOptions,
  ctx: ExecuteCompletionContext
): { nextInstanceId: string | null } {
  const { tx, userId, now } = ctx;
  const completedDate = now.split('T')[0];

  const openSubtasks = task.subtasks.filter((s) => !s.isCompleted);
  if (openSubtasks.length > 0 && !options.completeRemainingSubtasks) {
    throw new SubtasksConfirmationRequiredError();
  }

  if (openSubtasks.length > 0) {
    tx.update(subtasks)
      .set({ isCompleted: 1, completedAt: now, updatedAt: now })
      .where(and(eq(subtasks.taskId, task.id), eq(subtasks.isCompleted, 0)))
      .run();
  }

  tx.update(tasks)
    .set({ isCompleted: 1, completedAt: now, updatedAt: now })
    .where(eq(tasks.id, task.id))
    .run();

  if (!task.recurrenceRule || !task.recurrenceGroupId) {
    return { nextInstanceId: null };
  }

  const nextDate = calculateNextOccurrence(task.recurrenceRule, completedDate);
  const existingInstances = tx
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.recurrenceGroupId, task.recurrenceGroupId),
        eq(tasks.isCompleted, 0),
        eq(tasks.userId, userId)
      )
    )
    .all();

  if (existingInstances.length > 0) {
    const existingId = existingInstances[0].id;
    tx.update(tasks)
      .set({
        notBefore: normalizeDate(nextDate),
        deadline: task.deadline ? normalizeDate(nextDate) : null,
        updatedAt: now,
      })
      .where(eq(tasks.id, existingId))
      .run();

    tx.delete(subtasks).where(eq(subtasks.taskId, existingId)).run();
    const recurringSubtasks = buildRecurringSubtaskInserts(existingId, task.subtasks, now);
    if (recurringSubtasks.length > 0) {
      tx.insert(subtasks).values(recurringSubtasks).run();
    }
    return { nextInstanceId: existingId };
  }

  const nextInstanceId = nanoid();
  tx.insert(tasks).values({
    id: nextInstanceId,
    userId,
    title: task.title,
    description: task.description,
    deadline: task.deadline ? normalizeDate(nextDate) : null,
    priority: task.priority,
    notBefore: normalizeDate(nextDate),
    recurrenceGroupId: task.recurrenceGroupId,
    recurrenceRule: JSON.stringify(task.recurrenceRule),
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  }).run();

  const recurringSubtasks = buildRecurringSubtaskInserts(nextInstanceId, task.subtasks, now);
  if (recurringSubtasks.length > 0) {
    tx.insert(subtasks).values(recurringSubtasks).run();
  }

  return { nextInstanceId };
}
