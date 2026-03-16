import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import type { Task, CreateTaskInput, UpdateTaskInput } from '../types';

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

export function useTasks() {
  const [active, setActive] = useState<Task[]>([]);
  const [upcoming, setUpcoming] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingCompletionTask, setPendingCompletionTask] = useState<Task | null>(null);

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

    setActive((prev) => prev.filter((t) => t.id !== id));
    setUpcoming((prev) => prev.filter((t) => t.id !== id));
    setError(null);

    api.completeTask(
      id,
      confirmRemainingSubtasks ? { completeRemainingSubtasks: true } : undefined,
    ).then(() => {
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

  const deleteTask = useCallback((id: string) => {
    const prevActive = active;
    const prevUpcoming = upcoming;
    setActive((prev) => prev.filter((t) => t.id !== id));
    setUpcoming((prev) => prev.filter((t) => t.id !== id));
    setPendingCompletionTask((current) => (
      current?.id === id ? null : current
    ));

    api.deleteTask(id).catch((e: any) => {
      setActive(prevActive);
      setUpcoming(prevUpcoming);
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
    deleteTask,
    createTask,
    updateTask,
  };
}
