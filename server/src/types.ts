export type Priority = 'high' | 'default' | 'low';

export type RecurrenceRule =
  | { type: 'weekdays'; days: number[] }
  | { type: 'days_after'; interval: number }
  | { type: 'months_after'; interval: number };

export interface SubtaskInput {
  title: string;
  isCompleted?: boolean;
}

export interface UpdateSubtaskInput {
  id: string;
  title?: string;
  isCompleted?: boolean;
}

export interface SubtaskMutationInput {
  create?: SubtaskInput[];
  update?: UpdateSubtaskInput[];
  delete?: string[];
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  deadline?: string;
  priority?: Priority;
  notBefore?: string;
  recurrenceRule?: RecurrenceRule;
  subtasks?: SubtaskInput[];
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  deadline?: string | null;
  priority?: Priority;
  notBefore?: string | null;
  recurrenceRule?: RecurrenceRule | null;
  subtasks?: SubtaskMutationInput;
}

export interface CompleteTaskOptions {
  completeRemainingSubtasks?: boolean;
}

export interface SubtaskResponse {
  id: string;
  taskId: string;
  title: string;
  isCompleted: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
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
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  subtasks: SubtaskResponse[];
}

export interface CompleteTaskResult {
  completed: TaskResponse | null;
  nextInstance: TaskResponse | null;
  requiresConfirmation: boolean;
}

export interface ReorderTasksInput {
  taskIds: string[];
}
