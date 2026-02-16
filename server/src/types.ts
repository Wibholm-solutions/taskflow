export type Priority = 'high' | 'default' | 'low';

export type RecurrenceRule =
  | { type: 'weekdays'; days: number[] }
  | { type: 'days_after'; interval: number }
  | { type: 'months_after'; interval: number };

export interface CreateTaskInput {
  title: string;
  description?: string;
  deadline?: string;
  priority?: Priority;
  notBefore?: string;
  recurrenceRule?: RecurrenceRule;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  deadline?: string | null;
  priority?: Priority;
  notBefore?: string | null;
  recurrenceRule?: RecurrenceRule | null;
}

export interface TaskResponse {
  id: string;
  title: string;
  description: string | null;
  deadline: string | null;
  priority: Priority;
  isCompleted: boolean;
  completedAt: string | null;
  notBefore: string | null;
  recurrenceGroupId: string | null;
  recurrenceRule: RecurrenceRule | null;
  createdAt: string;
  updatedAt: string;
}
