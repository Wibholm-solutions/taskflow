import { useState, useEffect, useRef, useCallback } from 'react';
import type { Task } from '../types';

export interface DragState {
  draggedId: string;
  overIndex: number;
}

interface UseTouchDragOptions {
  items: Task[];
  getBucketKey: (task: Task) => string;
  onReorder: (taskIds: string[]) => void;
}

export interface UseTouchDragResult {
  dragState: DragState | null;
  handleTouchDragStart: (task: Task, touch: React.Touch) => void;
}

function findOverIndex(items: Task[], clientY: number): number {
  for (let i = 0; i < items.length; i++) {
    const el = document.querySelector(`[data-testid="task-${items[i].id}"]`);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (clientY < midY) return i;
  }
  return items.length - 1;
}

export function useTouchDrag(options: UseTouchDragOptions): UseTouchDragResult {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const dragStateRef = useRef(dragState);
  dragStateRef.current = dragState;

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!dragStateRef.current) return;
    e.preventDefault();
    const clientY = e.touches[0].clientY;
    const overIndex = findOverIndex(optionsRef.current.items, clientY);
    setDragState((prev) => prev ? { ...prev, overIndex } : null);
  }, []);

  const handleTouchEnd = useCallback(() => {
    const state = dragStateRef.current;
    if (!state) return;

    const { items, getBucketKey, onReorder } = optionsRef.current;
    const draggedTask = items.find((t) => t.id === state.draggedId);
    if (draggedTask) {
      const bucketKey = getBucketKey(draggedTask);

      // Check that the drop target is in the same bucket
      const targetTask = items[state.overIndex];
      if (!targetTask || getBucketKey(targetTask) !== bucketKey) {
        setDragState(null);
        return;
      }

      const bucketItems = items.filter((t) => getBucketKey(t) === bucketKey);
      const originalBucketIndex = bucketItems.findIndex((t) => t.id === state.draggedId);
      const targetBucketIndex = bucketItems.findIndex((t) => t.id === targetTask.id);

      if (originalBucketIndex !== targetBucketIndex) {
        const ids = bucketItems.map((t) => t.id).filter((id) => id !== state.draggedId);
        ids.splice(targetBucketIndex, 0, state.draggedId);
        onReorder(ids);
      }
    }

    setDragState(null);
  }, []);

  const handleTouchCancel = useCallback(() => {
    if (!dragStateRef.current) return;
    setDragState(null);
  }, []);

  useEffect(() => {
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
    document.addEventListener('touchcancel', handleTouchCancel);
    return () => {
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [handleTouchMove, handleTouchEnd, handleTouchCancel]);

  const handleTouchDragStart = (task: Task, _touch: React.Touch) => {
    const index = optionsRef.current.items.findIndex((t) => t.id === task.id);
    if (index === -1) return;
    setDragState({ draggedId: task.id, overIndex: index });
  };

  return { dragState, handleTouchDragStart };
}
