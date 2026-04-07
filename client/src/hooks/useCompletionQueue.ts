import { useState, useEffect, useCallback, useRef } from 'react';
import type { Task, PendingCompletion, CompleteTaskOptions } from '../types';

const UNDO_DELAY_MS = 5000;
const MAX_PENDING = 3;

export interface CompletionQueueDeps {
  onComplete: (taskId: string, options?: CompleteTaskOptions) => Promise<unknown>;
  onRestore: (snapshot: Task, list: 'active' | 'upcoming', index: number) => void;
  onError: (message: string) => void;
  refresh: () => Promise<void>;
}

export interface CompletionQueueResult {
  pendingCompletions: PendingCompletion[];
  enqueue: (entry: Omit<PendingCompletion, 'timerId'>) => void;
  undoCompletion: (taskId: string) => void;
  flushCompletions: () => void;
}

export function useCompletionQueue(deps: CompletionQueueDeps): CompletionQueueResult {
  const [pendingCompletions, setPendingCompletions] = useState<PendingCompletion[]>([]);
  const pendingRef = useRef(pendingCompletions);
  pendingRef.current = pendingCompletions;

  const enqueue = useCallback((entry: Omit<PendingCompletion, 'timerId'>) => {
    const fullEntry: PendingCompletion = {
      ...entry,
      timerId: setTimeout(() => {
        setPendingCompletions((prev) => prev.filter((p) => p.taskId !== entry.taskId));
        const options = entry.completeRemainingSubtasks ? { completeRemainingSubtasks: true } : undefined;
        deps.onComplete(entry.taskId, options).then(() => {
          deps.refresh();
        }).catch((e: any) => {
          deps.onRestore(entry.taskSnapshot, entry.originalList, entry.originalIndex);
          deps.onError(e.message);
        });
      }, UNDO_DELAY_MS),
    };

    setPendingCompletions((prev) => {
      if (prev.length >= MAX_PENDING) {
        const oldest = prev[0];
        clearTimeout(oldest.timerId);
        const opts = oldest.completeRemainingSubtasks ? { completeRemainingSubtasks: true } : undefined;
        deps.onComplete(oldest.taskId, opts).then(() => {
          deps.refresh();
        }).catch((e: any) => {
          deps.onRestore(oldest.taskSnapshot, oldest.originalList, oldest.originalIndex);
          deps.onError(e.message);
        });
        return [...prev.slice(1), fullEntry];
      }
      return [...prev, fullEntry];
    });
  }, [deps]);

  const undoCompletion = useCallback((taskId: string) => {
    setPendingCompletions((prev) => {
      const entry = prev.find((p) => p.taskId === taskId);
      if (!entry) return prev;

      clearTimeout(entry.timerId);
      deps.onRestore(entry.taskSnapshot, entry.originalList, entry.originalIndex);
      return prev.filter((p) => p.taskId !== taskId);
    });
  }, [deps]);

  const flushCompletions = useCallback(() => {
    setPendingCompletions((prev) => {
      for (const entry of prev) {
        clearTimeout(entry.timerId);
        const options = entry.completeRemainingSubtasks ? { completeRemainingSubtasks: true } : undefined;
        deps.onComplete(entry.taskId, options);
      }
      return [];
    });
  }, [deps]);

  // beforeunload handler
  useEffect(() => {
    const handleBeforeUnload = () => {
      for (const entry of pendingCompletions) {
        clearTimeout(entry.timerId);
        const body = entry.completeRemainingSubtasks
          ? JSON.stringify({ completeRemainingSubtasks: true })
          : undefined;
        const base = import.meta.env.BASE_URL.replace(/\/$/, '');
        const url = `${base}/api/tasks/${entry.taskId}/complete`;
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

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      pendingRef.current.forEach((entry) => clearTimeout(entry.timerId));
    };
  }, []);

  return { pendingCompletions, enqueue, undoCompletion, flushCompletions };
}
