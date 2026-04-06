/**
 * @vitest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useSubtaskConfirmation } from './useSubtaskConfirmation';
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

describe('useSubtaskConfirmation', () => {
  it('setPending stores the task', () => {
    const deps = { onConfirm: vi.fn(), taskExistsInState: vi.fn().mockReturnValue(true) };
    const { result } = renderHook(() => useSubtaskConfirmation(deps));

    expect(result.current.pendingCompletionTask).toBeNull();

    act(() => {
      result.current.setPending(makeTask());
    });

    expect(result.current.pendingCompletionTask).toEqual(expect.objectContaining({ id: 'task-1' }));
  });

  it('confirmPendingCompletion calls onConfirm with task id and clears state', () => {
    const deps = { onConfirm: vi.fn(), taskExistsInState: vi.fn().mockReturnValue(true) };
    const { result } = renderHook(() => useSubtaskConfirmation(deps));

    act(() => {
      result.current.setPending(makeTask());
    });

    act(() => {
      result.current.confirmPendingCompletion();
    });

    expect(deps.onConfirm).toHaveBeenCalledWith('task-1');
  });

  it('confirmPendingCompletion does nothing when no pending task', () => {
    const deps = { onConfirm: vi.fn(), taskExistsInState: vi.fn().mockReturnValue(true) };
    const { result } = renderHook(() => useSubtaskConfirmation(deps));

    act(() => {
      result.current.confirmPendingCompletion();
    });

    expect(deps.onConfirm).not.toHaveBeenCalled();
  });

  it('cancelPendingCompletion clears state', () => {
    const deps = { onConfirm: vi.fn(), taskExistsInState: vi.fn().mockReturnValue(true) };
    const { result } = renderHook(() => useSubtaskConfirmation(deps));

    act(() => {
      result.current.setPending(makeTask());
    });

    act(() => {
      result.current.cancelPendingCompletion();
    });

    expect(result.current.pendingCompletionTask).toBeNull();
  });

  it('clearPending clears state for matching task id', () => {
    const deps = { onConfirm: vi.fn(), taskExistsInState: vi.fn().mockReturnValue(true) };
    const { result } = renderHook(() => useSubtaskConfirmation(deps));

    act(() => {
      result.current.setPending(makeTask());
    });

    act(() => {
      result.current.clearPending('task-1');
    });

    expect(result.current.pendingCompletionTask).toBeNull();
  });

  it('clearPending does not clear state for non-matching task id', () => {
    const deps = { onConfirm: vi.fn(), taskExistsInState: vi.fn().mockReturnValue(true) };
    const { result } = renderHook(() => useSubtaskConfirmation(deps));

    act(() => {
      result.current.setPending(makeTask());
    });

    act(() => {
      result.current.clearPending('other-task');
    });

    expect(result.current.pendingCompletionTask).not.toBeNull();
  });

  it('auto-clears when task no longer exists in state', () => {
    let exists = true;
    const deps = {
      onConfirm: vi.fn(),
      taskExistsInState: vi.fn(() => exists),
    };
    const { result, rerender } = renderHook(() => useSubtaskConfirmation(deps));

    act(() => {
      result.current.setPending(makeTask());
    });

    expect(result.current.pendingCompletionTask).not.toBeNull();

    exists = false;
    rerender();

    expect(result.current.pendingCompletionTask).toBeNull();
  });
});
