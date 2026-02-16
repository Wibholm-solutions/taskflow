import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import type { Task, CreateTaskInput } from '../types';

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

  const completeTask = useCallback((id: string) => {
    // Optimistic: remove from active/upcoming
    const prevActive = active;
    const prevUpcoming = upcoming;
    setActive((prev) => prev.filter((t) => t.id !== id));
    setUpcoming((prev) => prev.filter((t) => t.id !== id));

    api.completeTask(id).then((result) => {
      if (result.nextInstance) {
        // Add next instance to the appropriate list
        const today = new Date().toISOString().split('T')[0];
        if (result.nextInstance.notBefore && result.nextInstance.notBefore > today) {
          setUpcoming((prev) => [...prev, result.nextInstance!]);
        } else {
          setActive((prev) => [...prev, result.nextInstance!]);
        }
      }
    }).catch((e: any) => {
      // Rollback
      setActive(prevActive);
      setUpcoming(prevUpcoming);
      setError(e.message);
    });
  }, [active, upcoming]);

  const deleteTask = useCallback((id: string) => {
    const prevActive = active;
    const prevUpcoming = upcoming;
    setActive((prev) => prev.filter((t) => t.id !== id));
    setUpcoming((prev) => prev.filter((t) => t.id !== id));

    api.deleteTask(id).catch((e: any) => {
      setActive(prevActive);
      setUpcoming(prevUpcoming);
      setError(e.message);
    });
  }, [active, upcoming]);

  const createTask = useCallback(async (input: CreateTaskInput) => {
    try {
      const task = await api.createTask(input);
      const today = new Date().toISOString().split('T')[0];
      if (task.notBefore && task.notBefore > today) {
        setUpcoming((prev) => [...prev, task]);
      } else {
        setActive((prev) => [...prev, task]);
      }
      return task;
    } catch (e: any) {
      setError(e.message);
      throw e;
    }
  }, []);

  const updateTask = useCallback(async (id: string, input: Partial<CreateTaskInput>) => {
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
    deleteTask,
    createTask,
    updateTask,
  };
}
