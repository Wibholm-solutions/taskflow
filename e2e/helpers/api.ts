import type { APIRequestContext } from '@playwright/test';

export interface CreateTaskData {
  title: string;
  description?: string;
  deadline?: string;
  priority?: 'high' | 'default' | 'low';
  subtasks?: Array<{
    title: string;
    isCompleted?: boolean;
  }>;
  notBefore?: string;
  recurrenceRule?: {
    type: 'weekdays' | 'days_after' | 'months_after';
    days?: number[];
    interval?: number;
  };
}

interface CompleteTaskOptions {
  completeRemainingSubtasks?: boolean;
}

export class ApiHelper {
  constructor(private request: APIRequestContext) {}

  async createTask(data: CreateTaskData) {
    const res = await this.request.post('/todo/api/tasks', { data });
    if (!res.ok()) throw new Error(`createTask failed: ${res.status()}`);
    return res.json();
  }

  async getTasks() {
    const res = await this.request.get('/todo/api/tasks');
    if (!res.ok()) throw new Error(`getTasks failed: ${res.status()}`);
    return res.json();
  }

  async completeTask(id: string, options?: CompleteTaskOptions) {
    const res = await this.request.post(`/todo/api/tasks/${id}/complete`, {
      data: options?.completeRemainingSubtasks ? options : undefined,
    });
    if (!res.ok()) throw new Error(`completeTask failed: ${res.status()}`);
    return res.json();
  }

  async deleteAllTasks() {
    const { active, upcoming } = await this.getTasks();
    const all = [...active, ...upcoming];
    for (const task of all) {
      await this.request.delete(`/todo/api/tasks/${task.id}`);
    }
  }
}
