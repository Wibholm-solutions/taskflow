import { useState, useEffect, useCallback } from 'react';
import type { Task } from '../types';

export interface SubtaskConfirmationDeps {
  onConfirm: (taskId: string) => void;
  taskExistsInState: (taskId: string) => boolean;
}

export interface SubtaskConfirmationResult {
  pendingCompletionTask: Task | null;
  setPending: (task: Task) => void;
  clearPending: (taskId: string) => void;
  confirmPendingCompletion: () => void;
  cancelPendingCompletion: () => void;
}

export function useSubtaskConfirmation(deps: SubtaskConfirmationDeps): SubtaskConfirmationResult {
  const [pendingCompletionTask, setPendingCompletionTask] = useState<Task | null>(null);

  const setPending = useCallback((task: Task) => {
    setPendingCompletionTask(task);
  }, []);

  const clearPending = useCallback((taskId: string) => {
    setPendingCompletionTask((current) => (current?.id === taskId ? null : current));
  }, []);

  const confirmPendingCompletion = useCallback(() => {
    if (!pendingCompletionTask) return;
    deps.onConfirm(pendingCompletionTask.id);
  }, [pendingCompletionTask, deps]);

  const cancelPendingCompletion = useCallback(() => {
    setPendingCompletionTask(null);
  }, []);

  // Auto-clear when task no longer exists in state
  useEffect(() => {
    if (!pendingCompletionTask) return;
    if (!deps.taskExistsInState(pendingCompletionTask.id)) {
      setPendingCompletionTask(null);
    }
  });

  return {
    pendingCompletionTask,
    setPending,
    clearPending,
    confirmPendingCompletion,
    cancelPendingCompletion,
  };
}
