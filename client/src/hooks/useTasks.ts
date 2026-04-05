import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import type { Task, CreateTaskInput, UpdateTaskInput, PendingCompletion } from '../types';

const UNDO_DELAY_MS = 5000;
const MAX_PENDING = 3;

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
  const [pendingCompletionTask, setPendingCompletionTask] = useState<Task | null>(null);
  const [pendingCompletions, setPendingCompletions] = useState<PendingCompletion[]>([]);

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

  useEffect(() => {
    if (!pendingCompletionTask) {
      return;
    }

    if (!taskExistsInState(active, upcoming, pendingCompletionTask.id)) {
      setPendingCompletionTask(null);
    }
  }, [active, upcoming, pendingCompletionTask]);

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
        setPendingCompletionTask((current) => (
          current?.id === id ? null : current
        ));
        refresh();
      }).catch((e: any) => {
        if (taskLocation.list === 'active' && task) {
          setActive((current) => restoreTaskInList(current, task, taskLocation.index));
        }
        if (taskLocation.list === 'upcoming' && task) {
          setUpcoming((current) => restoreTaskInList(current, task, taskLocation.index));
        }
        if (e.message === 'subtasks_confirmation_required' && task) {
          setPendingCompletionTask(task);
          return;
        }
        setPendingCompletionTask((current) => (
          current?.id === id ? null : current
        ));
        setError(e.message);
      });
      return;
    }

    // Enqueue with delay — API call fires after UNDO_DELAY_MS
    const entry: PendingCompletion = {
      taskId: id,
      taskSnapshot: task,
      originalList: taskLocation.list,
      originalIndex: taskLocation.index,
      completeRemainingSubtasks: confirmRemainingSubtasks,
      timerId: 0 as any,
    };

    entry.timerId = setTimeout(() => {
      setPendingCompletions((prev) => prev.filter((p) => p.taskId !== id));
      const options = confirmRemainingSubtasks ? { completeRemainingSubtasks: true } : undefined;
      api.completeTask(id, options).then(() => {
        setPendingCompletionTask((current) => (
          current?.id === id ? null : current
        ));
        refresh();
      }).catch((e: any) => {
        if (entry.originalList === 'active') {
          setActive((current) => restoreTaskInList(current, entry.taskSnapshot, entry.originalIndex));
        } else {
          setUpcoming((current) => restoreTaskInList(current, entry.taskSnapshot, entry.originalIndex));
        }
        setPendingCompletionTask((current) => (
          current?.id === id ? null : current
        ));
        setError(e.message);
      });
    }, UNDO_DELAY_MS);

    setPendingCompletions((prev) => {
      if (prev.length >= MAX_PENDING) {
        const oldest = prev[0];
        clearTimeout(oldest.timerId);
        const opts = oldest.completeRemainingSubtasks ? { completeRemainingSubtasks: true } : undefined;
        api.completeTask(oldest.taskId, opts).then(() => {
          setPendingCompletionTask((current) => (
            current?.id === oldest.taskId ? null : current
          ));
          refresh();
        }).catch((e: any) => {
          if (oldest.originalList === 'active') {
            setActive((current) => restoreTaskInList(current, oldest.taskSnapshot, oldest.originalIndex));
          } else {
            setUpcoming((current) => restoreTaskInList(current, oldest.taskSnapshot, oldest.originalIndex));
          }
          setError(e.message);
        });
        return [...prev.slice(1), entry];
      }
      return [...prev, entry];
    });
  }, [active, upcoming, refresh]);

  const completeTask = useCallback((id: string) => {
    completeTaskRequest(id);
  }, [completeTaskRequest]);

  const confirmPendingCompletion = useCallback(() => {
    if (!pendingCompletionTask) {
      return;
    }

    completeTaskRequest(pendingCompletionTask.id, true);
  }, [completeTaskRequest, pendingCompletionTask]);

  const cancelPendingCompletion = useCallback(() => {
    setPendingCompletionTask(null);
  }, []);

  const undoCompletion = useCallback((taskId: string) => {
    setPendingCompletions((prev) => {
      const entry = prev.find((p) => p.taskId === taskId);
      if (!entry) return prev;

      clearTimeout(entry.timerId);

      if (entry.originalList === 'active') {
        setActive((current) => restoreTaskInList(current, entry.taskSnapshot, entry.originalIndex));
      } else {
        setUpcoming((current) => restoreTaskInList(current, entry.taskSnapshot, entry.originalIndex));
      }

      return prev.filter((p) => p.taskId !== taskId);
    });
  }, []);

  const flushCompletions = useCallback(() => {
    setPendingCompletions((prev) => {
      for (const entry of prev) {
        clearTimeout(entry.timerId);
        const options = entry.completeRemainingSubtasks ? { completeRemainingSubtasks: true } : undefined;
        api.completeTask(entry.taskId, options);
      }
      return [];
    });
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      for (const entry of pendingCompletions) {
        clearTimeout(entry.timerId);
        const body = entry.completeRemainingSubtasks
          ? JSON.stringify({ completeRemainingSubtasks: true })
          : undefined;
        const url = `/todo/api/tasks/${entry.taskId}/complete`;
        if (navigator.sendBeacon) {
          navigator.sendBeacon(url, body ? new Blob([body], { type: 'application/json' }) : undefined);
        } else {
          fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true });
        }
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [pendingCompletions]);

  const deleteTask = useCallback((id: string) => {
    const taskLocation = findTaskLocation(active, upcoming, id);
    const task = taskLocation.task;

    setActive((prev) => prev.filter((t) => t.id !== id));
    setUpcoming((prev) => prev.filter((t) => t.id !== id));
    setPendingCompletionTask((current) => (
      current?.id === id ? null : current
    ));

    api.deleteTask(id).catch((e: any) => {
      if (taskLocation.list === 'active' && task) {
        setActive((current) => restoreTaskInList(current, task, taskLocation.index));
      }
      if (taskLocation.list === 'upcoming' && task) {
        setUpcoming((current) => restoreTaskInList(current, task, taskLocation.index));
      }
      setError(e.message);
    });
  }, [active, upcoming]);

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
      // Re-fetch to get proper sorting
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
    pendingCompletionTask,
    confirmPendingCompletion,
    cancelPendingCompletion,
    pendingCompletions,
    undoCompletion,
    flushCompletions,
    deleteTask,
    createTask,
    updateTask,
    reorderTasks,
  };
}
