// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTasks } from '../src/hooks/useTasks';
import { api } from '../src/services/api';

vi.mock('../src/services/api');

describe('useTasks', () => {
  const parentTask = {
    id: '1',
    title: 'Parent task',
    description: null,
    deadline: null,
    priority: 'default',
    isCompleted: false,
    completedAt: null,
    notBefore: null,
    recurrenceGroupId: null,
    recurrenceRule: null,
    createdAt: '2026-03-15T00:00:00.000Z',
    updatedAt: '2026-03-15T00:00:00.000Z',
    subtasks: [
      {
        id: 'subtask-1',
        taskId: '1',
        title: 'Open subtask',
        isCompleted: false,
        completedAt: null,
        createdAt: '2026-03-15T00:00:00.000Z',
        updatedAt: '2026-03-15T00:00:00.000Z',
      },
    ],
  } as any;

  beforeEach(() => {
    vi.mocked(api.listTasks).mockResolvedValue({ active: [], upcoming: [] });
    vi.mocked(api.completeTask).mockReset();
  });

  it('should fetch tasks on mount', async () => {
    vi.mocked(api.listTasks).mockResolvedValue({
      active: [{ id: '1', title: 'Task 1', priority: 'default', isCompleted: false } as any],
      upcoming: [],
    });

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.active).toHaveLength(1));
    expect(result.current.active[0].title).toBe('Task 1');
  });

  it('should optimistically remove task on complete', async () => {
    vi.mocked(api.listTasks).mockResolvedValue({
      active: [{ id: '1', title: 'Task 1', priority: 'default', isCompleted: false } as any],
      upcoming: [],
    });
    vi.mocked(api.completeTask).mockResolvedValue({
      completed: { id: '1', isCompleted: true } as any,
      nextInstance: null,
    });

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.active).toHaveLength(1));

    act(() => { result.current.completeTask('1'); });

    expect(result.current.active).toHaveLength(0);
  });

  it('should rollback on complete failure', async () => {
    const task = { id: '1', title: 'Task 1', priority: 'default', isCompleted: false } as any;
    vi.mocked(api.listTasks).mockResolvedValue({ active: [task], upcoming: [] });
    vi.mocked(api.completeTask).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.active).toHaveLength(1));

    act(() => { result.current.completeTask('1'); });

    expect(result.current.active).toHaveLength(0);

    await waitFor(() => expect(result.current.active).toHaveLength(1));
    expect(result.current.error).toBe('Network error');
  });

  it('should surface pending completion confirmation instead of an error for aggregate tasks', async () => {
    vi.mocked(api.listTasks).mockResolvedValue({ active: [parentTask], upcoming: [] });
    vi.mocked(api.completeTask).mockRejectedValue(new Error('subtasks_confirmation_required'));

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.active).toHaveLength(1));

    act(() => {
      result.current.completeTask(parentTask.id);
    });

    expect(result.current.active).toHaveLength(0);

    await waitFor(() => expect(result.current.active).toHaveLength(1));
    expect(result.current.error).toBeNull();
    expect(result.current.pendingCompletionTask).toEqual(parentTask);
  });

  it('should confirm aggregate completion with completeRemainingSubtasks', async () => {
    vi.mocked(api.listTasks)
      .mockResolvedValueOnce({ active: [parentTask], upcoming: [] })
      .mockResolvedValueOnce({ active: [], upcoming: [] });
    vi.mocked(api.completeTask)
      .mockRejectedValueOnce(new Error('subtasks_confirmation_required'))
      .mockResolvedValueOnce({
        completed: {
          ...parentTask,
          isCompleted: true,
          completedAt: '2026-03-15T01:00:00.000Z',
          subtasks: parentTask.subtasks.map((subtask: any) => ({
            ...subtask,
            isCompleted: true,
            completedAt: '2026-03-15T01:00:00.000Z',
          })),
        },
        nextInstance: null,
        requiresConfirmation: false,
      } as any);

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.active).toHaveLength(1));

    act(() => {
      result.current.completeTask(parentTask.id);
    });

    await waitFor(() => expect(result.current.pendingCompletionTask?.id).toBe(parentTask.id));

    act(() => {
      result.current.confirmPendingCompletion();
    });

    expect(vi.mocked(api.completeTask)).toHaveBeenLastCalledWith(parentTask.id, {
      completeRemainingSubtasks: true,
    });

    await waitFor(() => {
      expect(result.current.pendingCompletionTask).toBeNull();
      expect(result.current.active).toHaveLength(0);
    });
  });

  it('should allow cancelling pending aggregate completion', async () => {
    vi.mocked(api.listTasks).mockResolvedValue({ active: [parentTask], upcoming: [] });
    vi.mocked(api.completeTask).mockRejectedValue(new Error('subtasks_confirmation_required'));

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.active).toHaveLength(1));

    act(() => {
      result.current.completeTask(parentTask.id);
    });

    await waitFor(() => expect(result.current.pendingCompletionTask?.id).toBe(parentTask.id));

    act(() => {
      result.current.cancelPendingCompletion();
    });

    expect(result.current.pendingCompletionTask).toBeNull();
    expect(result.current.active).toEqual([parentTask]);
  });
});
