import type {
  Task,
  TaskListResponse,
  CreateTaskInput,
  UpdateTaskInput,
  CompleteResponse,
  CompleteTaskOptions,
} from '../types';

const BASE = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/api`;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  listTasks: () => request<TaskListResponse>('/tasks'),

  createTask: (input: CreateTaskInput) =>
    request<Task>('/tasks', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  updateTask: (id: string, input: UpdateTaskInput) =>
    request<Task>(`/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  deleteTask: (id: string) =>
    request<void>(`/tasks/${id}`, { method: 'DELETE' }),

  completeTask: (id: string, options?: CompleteTaskOptions) =>
    request<CompleteResponse>(`/tasks/${id}/complete`, {
      method: 'POST',
      body: options ? JSON.stringify(options) : undefined,
    }),

  reorderTasks: (taskIds: string[]) =>
    request<void>('/tasks/reorder', {
      method: 'POST',
      body: JSON.stringify({ taskIds }),
    }),
};
