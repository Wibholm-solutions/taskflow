import { useRef, useCallback, useEffect, useState } from 'react';
import type { Task } from '../types';

export interface UseTouchDragOptions {
  items: Task[];
  getBucketKey: (task: Task) => string;
  onReorder: (taskIds: string[]) => void;
}

export interface DragState {
  draggedId: string;
  overIndex: number;
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
    if (clientY >= rect.top && clientY < rect.bottom) {
      return i;
    }
  }
  return -1;
}

export function useTouchDrag(options: UseTouchDragOptions): UseTouchDragResult {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const itemsRef = useRef(options.items);
  const getBucketKeyRef = useRef(options.getBucketKey);
  const onReorderRef = useRef(options.onReorder);

  itemsRef.current = options.items;
  getBucketKeyRef.current = options.getBucketKey;
  onReorderRef.current = options.onReorder;

  const handleTouchDragStart = useCallback((task: Task, _touch: React.Touch) => {
    const index = itemsRef.current.findIndex((t) => t.id === task.id);
    if (index === -1) return;
    const state = { draggedId: task.id, overIndex: index };
    dragStateRef.current = state;
    setDragState(state);
  }, []);

  useEffect(() => {
    const handleTouchMove = (e: TouchEvent) => {
      if (!dragStateRef.current) return;
      e.preventDefault();
      const touch = e.touches[0];
      const overIndex = findOverIndex(itemsRef.current, touch.clientY);
      if (overIndex !== -1 && overIndex !== dragStateRef.current.overIndex) {
        const state = { ...dragStateRef.current, overIndex };
        dragStateRef.current = state;
        setDragState(state);
      }
    };

    const handleTouchEnd = () => {
      if (!dragStateRef.current) return;
      const { draggedId, overIndex } = dragStateRef.current;
      const items = itemsRef.current;
      const draggedTask = items.find((t) => t.id === draggedId);
      if (!draggedTask) {
        dragStateRef.current = null;
        setDragState(null);
        return;
      }

      const bucketKey = getBucketKeyRef.current(draggedTask);
      const bucketItems = items.filter((t) => getBucketKeyRef.current(t) === bucketKey);
      const originalIndex = bucketItems.findIndex((t) => t.id === draggedId);

      if (originalIndex !== -1 && overIndex !== originalIndex && bucketItems.length > 1) {
        const reordered = bucketItems.map((t) => t.id).filter((id) => id !== draggedId);
        const targetIndex = Math.min(overIndex, reordered.length);
        reordered.splice(targetIndex, 0, draggedId);
        onReorderRef.current(reordered);
      }

      dragStateRef.current = null;
      setDragState(null);
    };

    const handleTouchCancel = () => {
      dragStateRef.current = null;
      setDragState(null);
    };

    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
    document.addEventListener('touchcancel', handleTouchCancel);

    return () => {
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, []);

  return { dragState, handleTouchDragStart };
}
