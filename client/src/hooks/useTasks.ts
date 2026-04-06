import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';
import type { Task, CreateTaskInput, UpdateTaskInput } from '../types';
import { useCompletionQueue } from './useCompletionQueue';
import { useSubtaskConfirmation } from './useSubtaskConfirmation';

interface TaskLocation {
  task: Task | null;
  list: 'active' | 'upcoming' | null;
  index: number;
}

function findTaskLocation(active: Task[], upcoming: Task[], id: string): TaskLocation {
  const activeIndex = active.findIndex((task) => task.id === id);
  if (activeIndex >= 0) {
    return { task: active[activeIndex], list: 'active', index: activeIndex };
  }

  const upcomingIndex = upcoming.findIndex((task) => task.id === id);
  if (upcomingIndex >= 0) {
    return { task: upcoming[upcomingIndex], list: 'upcoming', index: upcomingIndex };
  }

  return { task: null, list: null, index: -1 };
}

function restoreTaskInList(tasks: Task[], task: Task, index: number): Task[] {
  if (tasks.some((item) => item.id === task.id)) {
    return tasks;
  }

  const next = [...tasks];
  const insertIndex = Math.max(0, Math.min(index, next.length));
  next.splice(insertIndex, 0, task);
  return next;
}

function taskExistsInState(active: Task[], upcoming: Task[], id: string): boolean {
  return active.some((task) => task.id === id) || upcoming.some((task) => task.id === id);
}

function reorderActiveTasks(tasks: Task[], taskIds: string[]): Task[] {
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const reorderedBucket = taskIds
    .map((id) => taskMap.get(id))
    .filter((task): task is Task => task !== undefined);
  const reorderedIds = new Set(taskIds);
  let bucketIndex = 0;

  return tasks.map((task) => {
    if (!reorderedIds.has(task.id)) {
      return task;
    }

    const reorderedTask = reorderedBucket[bucketIndex];
    bucketIndex += 1;
    return reorderedTask;
  });
}

export function useTasks() {
  const [active, setActive] = useState<Task[]>([]);
  const [upcoming, setUpcoming] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.listTasks();
      setActive(data.active);
      setUpcoming(data.upcoming);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-clear errors after 3 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const completionQueue = useCompletionQueue({
    onComplete: (taskId, options) => api.completeTask(taskId, options),
    onRestore: (snapshot, list, index) => {
      if (list === 'active') {
        setActive((current) => restoreTaskInList(current, snapshot, index));
      } else {
        setUpcoming((current) => restoreTaskInList(current, snapshot, index));
      }
    },
    onError: (msg) => setError(msg),
    refresh,
  });

  // Ref to break circular dependency: subtaskConfirmation.onConfirm → completeTaskRequest → subtaskConfirmation
  const completeTaskRequestRef = useRef<(id: string, confirm: boolean) => void>(() => {});

  const subtaskConfirmation = useSubtaskConfirmation({
    onConfirm: (taskId) => completeTaskRequestRef.current(taskId, true),
    taskExistsInState: (id) => taskExistsInState(active, upcoming, id),
  });

  const completeTaskRequest = useCallback((id: string, confirmRemainingSubtasks = false) => {
    const taskLocation = findTaskLocation(active, upcoming, id);
    const task = taskLocation.task;

    if (!task || !taskLocation.list) return;

    setActive((prev) => prev.filter((t) => t.id !== id));
    setUpcoming((prev) => prev.filter((t) => t.id !== id));
    setError(null);

    // Tasks with incomplete subtasks hit the API immediately for the 409 confirmation flow
    if (!confirmRemainingSubtasks && task.subtasks?.some((s: any) => !s.isCompleted)) {
      api.completeTask(id, undefined).then(() => {
        subtaskConfirmation.clearPending(id);
        refresh();
      }).catch((e: any) => {
        if (taskLocation.list === 'active' && task) {
          setActive((current) => restoreTaskInList(current, task, taskLocation.index));
        }
        if (taskLocation.list === 'upcoming' && task) {
          setUpcoming((current) => restoreTaskInList(current, task, taskLocation.index));
        }
        if (e.message === 'subtasks_confirmation_required' && task) {
          subtaskConfirmation.setPending(task);
          return;
        }
        subtaskConfirmation.clearPending(id);
        setError(e.message);
      });
      return;
    }

    // Enqueue with delay — API call fires after UNDO_DELAY_MS
    completionQueue.enqueue({
      taskId: id,
      taskSnapshot: task,
      originalList: taskLocation.list,
      originalIndex: taskLocation.index,
      completeRemainingSubtasks: confirmRemainingSubtasks,
    });
  }, [active, upcoming, refresh, completionQueue, subtaskConfirmation]);

  completeTaskRequestRef.current = completeTaskRequest;

  const completeTask = useCallback((id: string) => {
    completeTaskRequest(id);
  }, [completeTaskRequest]);

  const deleteTask = useCallback((id: string) => {
    const taskLocation = findTaskLocation(active, upcoming, id);
    const task = taskLocation.task;

    setActive((prev) => prev.filter((t) => t.id !== id));
    setUpcoming((prev) => prev.filter((t) => t.id !== id));
    subtaskConfirmation.clearPending(id);

    api.deleteTask(id).catch((e: any) => {
      if (taskLocation.list === 'active' && task) {
        setActive((current) => restoreTaskInList(current, task, taskLocation.index));
      }
      if (taskLocation.list === 'upcoming' && task) {
        setUpcoming((current) => restoreTaskInList(current, task, taskLocation.index));
      }
      setError(e.message);
    });
  }, [active, upcoming, subtaskConfirmation]);

  const createTask = useCallback(async (input: CreateTaskInput) => {
    try {
      const task = await api.createTask(input);
      await refresh();
      return task;
    } catch (e: any) {
      setError(e.message);
      throw e;
    }
  }, [refresh]);

  const updateTask = useCallback(async (id: string, input: UpdateTaskInput) => {
    const prevActive = active;
    const prevUpcoming = upcoming;

    try {
      const updated = await api.updateTask(id, input);
      await refresh();
      return updated;
    } catch (e: any) {
      setActive(prevActive);
      setUpcoming(prevUpcoming);
      setError(e.message);
      throw e;
    }
  }, [active, upcoming, refresh]);

  const reorderTasks = useCallback(async (taskIds: string[]) => {
    const prevActive = active;
    const reordered = reorderActiveTasks(active, taskIds);

    setActive(reordered);

    try {
      await api.reorderTasks(taskIds);
      await refresh();
    } catch (e: any) {
      setActive(prevActive);
      setError(e.message);
      await refresh();
    }
  }, [active, refresh]);

  return {
    active,
    upcoming,
    loading,
    error,
    clearError,
    refresh,
    completeTask,
    pendingCompletionTask: subtaskConfirmation.pendingCompletionTask,
    confirmPendingCompletion: subtaskConfirmation.confirmPendingCompletion,
    cancelPendingCompletion: subtaskConfirmation.cancelPendingCompletion,
    pendingCompletions: completionQueue.pendingCompletions,
    undoCompletion: completionQueue.undoCompletion,
    flushCompletions: completionQueue.flushCompletions,
    deleteTask,
    createTask,
    updateTask,
    reorderTasks,
  };
}
