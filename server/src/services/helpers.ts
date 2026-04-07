import { nanoid } from 'nanoid';
import type { SubtaskInput } from '../types';

export function normalizeDate(value?: string | null): string | null {
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 10);
}

export function normalizeSubtaskTitle(title: string): string {
  return title.trim();
}

export function buildSubtaskInsert(
  taskId: string,
  input: { title: string; isCompleted?: boolean },
  now: string
) {
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

export function buildSubtaskInserts(
  taskId: string,
  inputs: { title: string; isCompleted?: boolean }[] | undefined,
  now: string
) {
  if (!inputs || inputs.length === 0) return [];

  const baseTime = new Date(now).getTime();
  return inputs
    .map((subtask, index) => {
      const subtaskTimestamp = new Date(baseTime + index).toISOString();
      return buildSubtaskInsert(taskId, subtask, subtaskTimestamp);
    })
    .filter((subtask): subtask is NonNullable<typeof subtask> => subtask !== null);
}
