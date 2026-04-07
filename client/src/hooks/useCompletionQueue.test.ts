/**
 * @vitest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useCompletionQueue } from './useCompletionQueue';
import type { Task } from '../types';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Test task',
    description: null,
    deadline: null,
    priority: 'default',
    isCompleted: false,
    completedAt: null,
    notBefore: null,
    recurrenceGroupId: null,
    recurrenceRule: null,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    subtasks: [],
    ...overrides,
  };
}

function makeDeps(overrides: Partial<Parameters<typeof useCompletionQueue>[0]> = {}) {
  return {
    onComplete: vi.fn().mockResolvedValue(undefined),
    onRestore: vi.fn(),
    onError: vi.fn(),
    refresh: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('useCompletionQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('enqueue adds entry to pendingCompletions', () => {
    const deps = makeDeps();
    const { result } = renderHook(() => useCompletionQueue(deps));

    act(() => {
      result.current.enqueue({
        taskId: 'task-1',
        taskSnapshot: makeTask(),
        originalList: 'active',
        originalIndex: 0,
        completeRemainingSubtasks: false,
      });
    });

    expect(result.current.pendingCompletions).toHaveLength(1);
    expect(result.current.pendingCompletions[0].taskId).toBe('task-1');
  });

  it('fires onComplete after 5s delay', async () => {
    const deps = makeDeps();
    const { result } = renderHook(() => useCompletionQueue(deps));

    act(() => {
      result.current.enqueue({
        taskId: 'task-1',
        taskSnapshot: makeTask(),
        originalList: 'active',
        originalIndex: 0,
        completeRemainingSubtasks: false,
      });
    });

    expect(deps.onComplete).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(deps.onComplete).toHaveBeenCalledWith('task-1', undefined);
    expect(result.current.pendingCompletions).toHaveLength(0);
  });

  it('passes completeRemainingSubtasks option when set', async () => {
    const deps = makeDeps();
    const { result } = renderHook(() => useCompletionQueue(deps));

    act(() => {
      result.current.enqueue({
        taskId: 'task-1',
        taskSnapshot: makeTask(),
        originalList: 'active',
        originalIndex: 0,
        completeRemainingSubtasks: true,
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(deps.onComplete).toHaveBeenCalledWith('task-1', { completeRemainingSubtasks: true });
  });

  it('undoCompletion cancels timer and restores task', () => {
    const deps = makeDeps();
    const { result } = renderHook(() => useCompletionQueue(deps));

    act(() => {
      result.current.enqueue({
        taskId: 'task-1',
        taskSnapshot: makeTask(),
        originalList: 'active',
        originalIndex: 2,
        completeRemainingSubtasks: false,
      });
    });

    act(() => {
      result.current.undoCompletion('task-1');
    });

    expect(result.current.pendingCompletions).toHaveLength(0);
    expect(deps.onRestore).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task-1' }),
      'active',
      2,
    );

    // Timer should have been cancelled — no API call after delay
    vi.advanceTimersByTime(5000);
    expect(deps.onComplete).not.toHaveBeenCalled();
  });

  it('flushCompletions fires all pending immediately', () => {
    const deps = makeDeps();
    const { result } = renderHook(() => useCompletionQueue(deps));

    act(() => {
      result.current.enqueue({
        taskId: 'task-1',
        taskSnapshot: makeTask({ id: 'task-1' }),
        originalList: 'active',
        originalIndex: 0,
        completeRemainingSubtasks: false,
      });
      result.current.enqueue({
        taskId: 'task-2',
        taskSnapshot: makeTask({ id: 'task-2' }),
        originalList: 'upcoming',
        originalIndex: 1,
        completeRemainingSubtasks: false,
      });
    });

    act(() => {
      result.current.flushCompletions();
    });

    expect(deps.onComplete).toHaveBeenCalledTimes(2);
    expect(result.current.pendingCompletions).toHaveLength(0);
  });

  it('evicts oldest when exceeding MAX_PENDING (3)', () => {
    const deps = makeDeps();
    const { result } = renderHook(() => useCompletionQueue(deps));

    // Fill to max
    act(() => {
      for (let i = 1; i <= 3; i++) {
        result.current.enqueue({
          taskId: `task-${i}`,
          taskSnapshot: makeTask({ id: `task-${i}` }),
          originalList: 'active',
          originalIndex: i - 1,
          completeRemainingSubtasks: false,
        });
      }
    });

    expect(result.current.pendingCompletions).toHaveLength(3);
    expect(deps.onComplete).not.toHaveBeenCalled();

    // Adding 4th should evict task-1
    act(() => {
      result.current.enqueue({
        taskId: 'task-4',
        taskSnapshot: makeTask({ id: 'task-4' }),
        originalList: 'active',
        originalIndex: 3,
        completeRemainingSubtasks: false,
      });
    });

    expect(result.current.pendingCompletions).toHaveLength(3);
    expect(deps.onComplete).toHaveBeenCalledWith('task-1', undefined);
    expect(result.current.pendingCompletions.map((p) => p.taskId)).toEqual([
      'task-2', 'task-3', 'task-4',
    ]);
  });

  it('calls onRestore and onError when API call fails', async () => {
    const deps = makeDeps({
      onComplete: vi.fn().mockRejectedValue(new Error('Network error')),
    });
    const { result } = renderHook(() => useCompletionQueue(deps));

    act(() => {
      result.current.enqueue({
        taskId: 'task-1',
        taskSnapshot: makeTask(),
        originalList: 'upcoming',
        originalIndex: 1,
        completeRemainingSubtasks: false,
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(deps.onRestore).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task-1' }),
      'upcoming',
      1,
    );
    expect(deps.onError).toHaveBeenCalledWith('Network error');
  });

  it('unmount clears timers for pending completions', () => {
    const deps = makeDeps();
    const { result, unmount } = renderHook(() => useCompletionQueue(deps));

    act(() => {
      result.current.enqueue({
        taskId: 'task-1',
        taskSnapshot: makeTask(),
        originalList: 'active',
        originalIndex: 0,
        completeRemainingSubtasks: false,
      });
    });

    expect(result.current.pendingCompletions).toHaveLength(1);

    unmount();

    // After unmount, advancing timers should NOT fire onComplete
    // because the timer was cleared during cleanup
    vi.advanceTimersByTime(5000);
    expect(deps.onComplete).not.toHaveBeenCalled();
  });

  it('beforeunload fires sendBeacon for pending completions', () => {
    const sendBeacon = vi.fn();
    vi.stubGlobal('navigator', { sendBeacon });

    const deps = makeDeps();
    const { result } = renderHook(() => useCompletionQueue(deps));

    act(() => {
      result.current.enqueue({
        taskId: 'task-1',
        taskSnapshot: makeTask(),
        originalList: 'active',
        originalIndex: 0,
        completeRemainingSubtasks: false,
      });
    });

    window.dispatchEvent(new Event('beforeunload'));

    expect(sendBeacon).toHaveBeenCalledWith(
      '/api/tasks/task-1/complete',
      undefined,
    );

    vi.unstubAllGlobals();
  });
});
