// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTouchDrag } from '../src/hooks/useTouchDrag';
import type { Task } from '../src/types';

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Task 1',
    description: null,
    deadline: null,
    priority: 'default',
    isCompleted: false,
    completedAt: null,
    notBefore: null,
    recurrenceGroupId: null,
    recurrenceRule: null,
    sortOrder: 0,
    createdAt: '2026-03-22T00:00:00.000Z',
    updatedAt: '2026-03-22T00:00:00.000Z',
    subtasks: [],
    ...overrides,
  };
}

function fireTouchMove(clientX: number, clientY: number) {
  const event = new Event('touchmove', { bubbles: true }) as any;
  event.touches = [{ clientX, clientY }];
  event.preventDefault = vi.fn();
  document.dispatchEvent(event);
}

function fireTouchEnd() {
  document.dispatchEvent(new Event('touchend', { bubbles: true }));
}

function fireTouchCancel() {
  document.dispatchEvent(new Event('touchcancel', { bubbles: true }));
}

describe('useTouchDrag', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null drag state initially', () => {
    const items = [createTask({ id: 'a' }), createTask({ id: 'b' })];
    const { result } = renderHook(() =>
      useTouchDrag({
        items,
        getBucketKey: () => 'bucket-1',
        onReorder: vi.fn(),
      }),
    );

    expect(result.current.dragState).toBeNull();
  });

  function setupTaskRects(tasks: { id: string; top: number; height: number }[]) {
    for (const t of tasks) {
      const el = document.createElement('div');
      el.setAttribute('data-testid', `task-${t.id}`);
      el.getBoundingClientRect = () => ({
        top: t.top,
        bottom: t.top + t.height,
        left: 0,
        right: 300,
        width: 300,
        height: t.height,
        x: 0,
        y: t.top,
        toJSON: () => {},
      });
      document.body.appendChild(el);
    }
  }

  function cleanupTaskRects() {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  }

  afterEach(() => {
    cleanupTaskRects();
  });

  it('sets drag state after handleTouchDragStart', () => {
    const items = [createTask({ id: 'a' }), createTask({ id: 'b' })];
    const { result } = renderHook(() =>
      useTouchDrag({
        items,
        getBucketKey: () => 'bucket-1',
        onReorder: vi.fn(),
      }),
    );

    act(() => {
      result.current.handleTouchDragStart(
        items[0],
        { clientX: 50, clientY: 100 } as React.Touch,
      );
    });

    expect(result.current.dragState).toEqual({
      draggedId: 'a',
      overIndex: 0,
    });
  });

  it('updates overIndex on touchmove during drag', () => {
    const items = [createTask({ id: 'a' }), createTask({ id: 'b' }), createTask({ id: 'c' })];
    setupTaskRects([
      { id: 'a', top: 0, height: 50 },
      { id: 'b', top: 50, height: 50 },
      { id: 'c', top: 100, height: 50 },
    ]);

    const { result } = renderHook(() =>
      useTouchDrag({
        items,
        getBucketKey: () => 'bucket-1',
        onReorder: vi.fn(),
      }),
    );

    act(() => {
      result.current.handleTouchDragStart(
        items[0],
        { clientX: 50, clientY: 25 } as React.Touch,
      );
    });

    // Move finger to task c's position
    act(() => {
      fireTouchMove(50, 125);
    });

    expect(result.current.dragState).toEqual({
      draggedId: 'a',
      overIndex: 2,
    });
  });

  it('calls onReorder with correct order on touchend', () => {
    const items = [createTask({ id: 'a' }), createTask({ id: 'b' }), createTask({ id: 'c' })];
    const onReorder = vi.fn();
    setupTaskRects([
      { id: 'a', top: 0, height: 50 },
      { id: 'b', top: 50, height: 50 },
      { id: 'c', top: 100, height: 50 },
    ]);

    const { result } = renderHook(() =>
      useTouchDrag({
        items,
        getBucketKey: () => 'bucket-1',
        onReorder,
      }),
    );

    // Drag task 'a' to position of task 'c'
    act(() => {
      result.current.handleTouchDragStart(items[0], { clientX: 50, clientY: 25 } as React.Touch);
    });
    act(() => {
      fireTouchMove(50, 125);
    });
    act(() => {
      fireTouchEnd();
    });

    expect(onReorder).toHaveBeenCalledWith(['b', 'c', 'a']);
    expect(result.current.dragState).toBeNull();
  });

  it('does not call onReorder for cross-bucket drag', () => {
    const items = [
      createTask({ id: 'a', priority: 'high' }),
      createTask({ id: 'b', priority: 'default' }),
    ];
    const onReorder = vi.fn();
    setupTaskRects([
      { id: 'a', top: 0, height: 50 },
      { id: 'b', top: 50, height: 50 },
    ]);

    const { result } = renderHook(() =>
      useTouchDrag({
        items,
        getBucketKey: (t) => t.priority,
        onReorder,
      }),
    );

    act(() => {
      result.current.handleTouchDragStart(items[0], { clientX: 50, clientY: 25 } as React.Touch);
    });
    act(() => {
      fireTouchMove(50, 75);
    });
    act(() => {
      fireTouchEnd();
    });

    expect(onReorder).not.toHaveBeenCalled();
    expect(result.current.dragState).toBeNull();
  });

  it('resets drag state on touchcancel', () => {
    const items = [createTask({ id: 'a' }), createTask({ id: 'b' })];
    const onReorder = vi.fn();

    const { result } = renderHook(() =>
      useTouchDrag({
        items,
        getBucketKey: () => 'bucket-1',
        onReorder,
      }),
    );

    act(() => {
      result.current.handleTouchDragStart(items[0], { clientX: 50, clientY: 25 } as React.Touch);
    });

    expect(result.current.dragState).not.toBeNull();

    act(() => {
      fireTouchCancel();
    });

    expect(result.current.dragState).toBeNull();
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('does not call onReorder for single-item bucket', () => {
    const items = [createTask({ id: 'a' })];
    const onReorder = vi.fn();
    setupTaskRects([{ id: 'a', top: 0, height: 50 }]);

    const { result } = renderHook(() =>
      useTouchDrag({
        items,
        getBucketKey: () => 'bucket-1',
        onReorder,
      }),
    );

    act(() => {
      result.current.handleTouchDragStart(items[0], { clientX: 50, clientY: 25 } as React.Touch);
    });
    act(() => {
      fireTouchEnd();
    });

    expect(onReorder).not.toHaveBeenCalled();
  });

  it('cleans up document listeners on unmount', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const items = [createTask({ id: 'a' })];

    const { unmount } = renderHook(() =>
      useTouchDrag({
        items,
        getBucketKey: () => 'bucket-1',
        onReorder: vi.fn(),
      }),
    );

    unmount();

    const removedTypes = removeSpy.mock.calls.map((c) => c[0]);
    expect(removedTypes).toContain('touchmove');
    expect(removedTypes).toContain('touchend');
  });
});
