// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTouchDrag } from '../src/hooks/useTouchDrag';
import type { Task } from '../src/types';

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Task',
    description: null,
    deadline: null,
    priority: 'default',
    isCompleted: false,
    completedAt: null,
    notBefore: null,
    recurrenceGroupId: null,
    recurrenceRule: null,
    sortOrder: 0,
    createdAt: '2026-03-16T00:00:00.000Z',
    updatedAt: '2026-03-16T00:00:00.000Z',
    subtasks: [],
    ...overrides,
  };
}

function dispatchTouchEvent(target: EventTarget, type: string, clientX: number, clientY: number) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as unknown as TouchEvent;
  Object.defineProperty(event, 'touches', {
    value: [{ clientX, clientY, identifier: 0 }],
  });
  Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
  target.dispatchEvent(event);
  return event;
}

describe('useTouchDrag', () => {
  it('returns null drag state initially', () => {
    const { result } = renderHook(() =>
      useTouchDrag({
        items: [createTask()],
        getBucketKey: () => 'bucket-a',
        onReorder: vi.fn(),
      })
    );
    expect(result.current.dragState).toBeNull();
  });

  it('sets dragState when handleTouchDragStart is called', () => {
    const task1 = createTask({ id: 'a', sortOrder: 0 });
    const task2 = createTask({ id: 'b', sortOrder: 1 });

    const { result } = renderHook(() =>
      useTouchDrag({
        items: [task1, task2],
        getBucketKey: () => 'bucket-a',
        onReorder: vi.fn(),
      })
    );

    act(() => {
      result.current.handleTouchDragStart(task1, { clientX: 100, clientY: 50 } as React.Touch);
    });

    expect(result.current.dragState).toEqual({
      draggedId: 'a',
      overIndex: 0,
    });
  });

  it('updates overIndex on touchmove based on clientY', () => {
    const task1 = createTask({ id: 'a', sortOrder: 0 });
    const task2 = createTask({ id: 'b', sortOrder: 1 });
    const task3 = createTask({ id: 'c', sortOrder: 2 });

    // Create DOM elements the hook will query
    const container = document.createElement('div');
    document.body.appendChild(container);
    ['a', 'b', 'c'].forEach((id, i) => {
      const el = document.createElement('div');
      el.setAttribute('data-testid', `task-${id}`);
      el.getBoundingClientRect = () => ({
        top: i * 60,
        bottom: (i + 1) * 60,
        left: 0, right: 300, width: 300, height: 60, x: 0, y: i * 60,
        toJSON() {},
      });
      container.appendChild(el);
    });

    const { result } = renderHook(() =>
      useTouchDrag({
        items: [task1, task2, task3],
        getBucketKey: () => 'bucket-a',
        onReorder: vi.fn(),
      })
    );

    act(() => {
      result.current.handleTouchDragStart(task1, { clientX: 100, clientY: 30 } as React.Touch);
    });

    // Move to task3's position (clientY=150, within [120,180])
    act(() => {
      dispatchTouchEvent(document, 'touchmove', 100, 150);
    });

    expect(result.current.dragState).toEqual({
      draggedId: 'a',
      overIndex: 2,
    });

    document.body.removeChild(container);
  });

  it('calls preventDefault on touchmove during drag to block scrolling', () => {
    const task1 = createTask({ id: 'x', sortOrder: 0 });

    const { result } = renderHook(() =>
      useTouchDrag({
        items: [task1],
        getBucketKey: () => 'bucket-a',
        onReorder: vi.fn(),
      })
    );

    // touchmove without drag should NOT preventDefault
    let event: TouchEvent;
    act(() => {
      event = dispatchTouchEvent(document, 'touchmove', 100, 50);
    });
    expect(event!.preventDefault).not.toHaveBeenCalled();

    // Start drag, then touchmove SHOULD preventDefault
    act(() => {
      result.current.handleTouchDragStart(task1, { clientX: 100, clientY: 50 } as React.Touch);
    });
    act(() => {
      event = dispatchTouchEvent(document, 'touchmove', 100, 80);
    });
    expect(event!.preventDefault).toHaveBeenCalled();
  });

  it('calls onReorder with new bucket order on touchend when position changed', () => {
    const task1 = createTask({ id: 'a', sortOrder: 0 });
    const task2 = createTask({ id: 'b', sortOrder: 1 });
    const task3 = createTask({ id: 'c', sortOrder: 2 });
    const onReorder = vi.fn();

    const container = document.createElement('div');
    document.body.appendChild(container);
    ['a', 'b', 'c'].forEach((id, i) => {
      const el = document.createElement('div');
      el.setAttribute('data-testid', `task-${id}`);
      el.getBoundingClientRect = () => ({
        top: i * 60, bottom: (i + 1) * 60,
        left: 0, right: 300, width: 300, height: 60, x: 0, y: i * 60,
        toJSON() {},
      });
      container.appendChild(el);
    });

    const { result } = renderHook(() =>
      useTouchDrag({
        items: [task1, task2, task3],
        getBucketKey: () => 'bucket-a',
        onReorder,
      })
    );

    // Drag task1 to position of task3
    act(() => {
      result.current.handleTouchDragStart(task1, { clientX: 100, clientY: 30 } as React.Touch);
    });
    act(() => {
      dispatchTouchEvent(document, 'touchmove', 100, 150);
    });
    act(() => {
      dispatchTouchEvent(document, 'touchend', 100, 150);
    });

    expect(onReorder).toHaveBeenCalledWith(['b', 'c', 'a']);
    expect(result.current.dragState).toBeNull();

    document.body.removeChild(container);
  });

  it('does NOT call onReorder when dropped at original position', () => {
    const task1 = createTask({ id: 'a', sortOrder: 0 });
    const task2 = createTask({ id: 'b', sortOrder: 1 });
    const onReorder = vi.fn();

    const { result } = renderHook(() =>
      useTouchDrag({
        items: [task1, task2],
        getBucketKey: () => 'bucket-a',
        onReorder,
      })
    );

    act(() => {
      result.current.handleTouchDragStart(task1, { clientX: 100, clientY: 30 } as React.Touch);
    });
    // Drop without moving (overIndex stays at 0, which is the original position)
    act(() => {
      dispatchTouchEvent(document, 'touchend', 100, 30);
    });

    expect(onReorder).not.toHaveBeenCalled();
    expect(result.current.dragState).toBeNull();
  });

  it('resets state on touchcancel without calling onReorder', () => {
    const task1 = createTask({ id: 'a', sortOrder: 0 });
    const task2 = createTask({ id: 'b', sortOrder: 1 });
    const onReorder = vi.fn();

    const container = document.createElement('div');
    document.body.appendChild(container);
    ['a', 'b'].forEach((id, i) => {
      const el = document.createElement('div');
      el.setAttribute('data-testid', `task-${id}`);
      el.getBoundingClientRect = () => ({
        top: i * 60, bottom: (i + 1) * 60,
        left: 0, right: 300, width: 300, height: 60, x: 0, y: i * 60,
        toJSON() {},
      });
      container.appendChild(el);
    });

    const { result } = renderHook(() =>
      useTouchDrag({
        items: [task1, task2],
        getBucketKey: () => 'bucket-a',
        onReorder,
      })
    );

    act(() => {
      result.current.handleTouchDragStart(task1, { clientX: 100, clientY: 30 } as React.Touch);
    });
    act(() => {
      dispatchTouchEvent(document, 'touchmove', 100, 90);
    });
    act(() => {
      dispatchTouchEvent(document, 'touchcancel', 100, 90);
    });

    expect(onReorder).not.toHaveBeenCalled();
    expect(result.current.dragState).toBeNull();

    document.body.removeChild(container);
  });

  it('does not reorder on cross-bucket drag', () => {
    const highTask = createTask({ id: 'h', priority: 'high', sortOrder: 0 });
    const normalTask = createTask({ id: 'n', priority: 'default', sortOrder: 1 });
    const onReorder = vi.fn();

    const container = document.createElement('div');
    document.body.appendChild(container);
    ['h', 'n'].forEach((id, i) => {
      const el = document.createElement('div');
      el.setAttribute('data-testid', `task-${id}`);
      el.getBoundingClientRect = () => ({
        top: i * 60, bottom: (i + 1) * 60,
        left: 0, right: 300, width: 300, height: 60, x: 0, y: i * 60,
        toJSON() {},
      });
      container.appendChild(el);
    });

    const { result } = renderHook(() =>
      useTouchDrag({
        items: [highTask, normalTask],
        getBucketKey: (t) => t.priority,
        onReorder,
      })
    );

    act(() => {
      result.current.handleTouchDragStart(highTask, { clientX: 100, clientY: 30 } as React.Touch);
    });
    act(() => {
      dispatchTouchEvent(document, 'touchmove', 100, 90);
    });
    act(() => {
      dispatchTouchEvent(document, 'touchend', 100, 90);
    });

    // highTask is alone in its bucket, so overIndex change doesn't produce a reorder
    expect(onReorder).not.toHaveBeenCalled();

    document.body.removeChild(container);
  });

  it('ignores handleTouchDragStart for tasks not in items list', () => {
    const task1 = createTask({ id: 'a', sortOrder: 0 });
    const unknownTask = createTask({ id: 'unknown', sortOrder: 99 });

    const { result } = renderHook(() =>
      useTouchDrag({
        items: [task1],
        getBucketKey: () => 'bucket-a',
        onReorder: vi.fn(),
      })
    );

    act(() => {
      result.current.handleTouchDragStart(unknownTask, { clientX: 100, clientY: 50 } as React.Touch);
    });

    expect(result.current.dragState).toBeNull();
  });

  it('clamps overIndex to valid range when touch is beyond last item', () => {
    const task1 = createTask({ id: 'a', sortOrder: 0 });
    const task2 = createTask({ id: 'b', sortOrder: 1 });

    const container = document.createElement('div');
    document.body.appendChild(container);
    ['a', 'b'].forEach((id, i) => {
      const el = document.createElement('div');
      el.setAttribute('data-testid', `task-${id}`);
      el.getBoundingClientRect = () => ({
        top: i * 60, bottom: (i + 1) * 60,
        left: 0, right: 300, width: 300, height: 60, x: 0, y: i * 60,
        toJSON() {},
      });
      container.appendChild(el);
    });

    const { result } = renderHook(() =>
      useTouchDrag({
        items: [task1, task2],
        getBucketKey: () => 'bucket-a',
        onReorder: vi.fn(),
      })
    );

    act(() => {
      result.current.handleTouchDragStart(task1, { clientX: 100, clientY: 30 } as React.Touch);
    });

    // Touch far below all items
    act(() => {
      dispatchTouchEvent(document, 'touchmove', 100, 9999);
    });

    // Should clamp to last index (1), not go out of bounds
    expect(result.current.dragState?.overIndex).toBe(1);

    document.body.removeChild(container);
  });

  it('resets on touchend if dragged task was removed during drag', () => {
    const task1 = createTask({ id: 'a', sortOrder: 0 });
    const task2 = createTask({ id: 'b', sortOrder: 1 });
    const onReorder = vi.fn();

    const items = [task1, task2];
    const { result, rerender } = renderHook(
      ({ items: hookItems }) =>
        useTouchDrag({
          items: hookItems,
          getBucketKey: () => 'bucket-a',
          onReorder,
        }),
      { initialProps: { items } }
    );

    act(() => {
      result.current.handleTouchDragStart(task1, { clientX: 100, clientY: 30 } as React.Touch);
    });

    // Remove task1 from items (simulating deletion during drag)
    rerender({ items: [task2] });

    act(() => {
      dispatchTouchEvent(document, 'touchend', 100, 30);
    });

    // Should not call onReorder since dragged task no longer exists
    expect(onReorder).not.toHaveBeenCalled();
    expect(result.current.dragState).toBeNull();
  });
});
