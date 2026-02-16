export type Priority = 'high' | 'default' | 'low';

export type RecurrenceRule =
  | { type: 'weekdays'; days: number[] }
  | { type: 'days_after'; interval: number }
  | { type: 'months_after'; interval: number };

export interface Task {
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

export interface TaskListResponse {
  active: Task[];
  upcoming: Task[];
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  deadline?: string;
  priority?: Priority;
  recurrenceRule?: RecurrenceRule;
}

export interface CompleteResponse {
  completed: Task;
  nextInstance: Task | null;
}
