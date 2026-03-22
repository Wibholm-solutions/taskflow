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
  const taskB = {
    id: '2',
    title: 'Task B',
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
    subtasks: [],
  } as any;

  beforeEach(() => {
    vi.mocked(api.listTasks).mockResolvedValue({ active: [], upcoming: [] });
    vi.mocked(api.completeTask).mockReset();
    vi.mocked(api.deleteTask).mockReset();
    (api as Record<string, any>).reorderTasks = vi.fn();
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
    vi.mocked(api.listTasks)
      .mockResolvedValueOnce({
        active: [{ id: '1', title: 'Task 1', priority: 'default', isCompleted: false } as any],
        upcoming: [],
      })
      .mockResolvedValueOnce({
        active: [],
        upcoming: [],
      });
    vi.mocked(api.completeTask).mockResolvedValue({
      completed: { id: '1', isCompleted: true } as any,
      nextInstance: null,
    });

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.active).toHaveLength(1));

    await act(async () => {
      await result.current.completeTask('1');
    });

    expect(result.current.active).toHaveLength(0);
    expect(vi.mocked(api.completeTask)).toHaveBeenCalledWith('1', undefined);
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

  it('should not clear pending confirmation for task A when task B completes successfully', async () => {
    vi.mocked(api.listTasks)
      .mockResolvedValueOnce({ active: [parentTask, taskB], upcoming: [] })
      .mockResolvedValueOnce({ active: [parentTask], upcoming: [] });
    vi.mocked(api.completeTask)
      .mockRejectedValueOnce(new Error('subtasks_confirmation_required'))
      .mockResolvedValueOnce({
        completed: { ...taskB, isCompleted: true, completedAt: '2026-03-15T01:00:00.000Z' },
        nextInstance: null,
      } as any);

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.active).toHaveLength(2));

    act(() => {
      result.current.completeTask(parentTask.id);
    });

    await waitFor(() => expect(result.current.pendingCompletionTask?.id).toBe(parentTask.id));

    act(() => {
      result.current.completeTask(taskB.id);
    });

    await waitFor(() => expect(result.current.active).toEqual([parentTask]));
    expect(result.current.pendingCompletionTask).toEqual(parentTask);
  });

  it('should restore only the affected task on completion failure instead of stale list snapshots', async () => {
    const taskC = {
      id: '3',
      title: 'Task C',
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
      subtasks: [],
    } as any;

    let rejectTaskB!: (error: Error) => void;
    vi.mocked(api.listTasks)
      .mockResolvedValueOnce({ active: [taskB, taskC], upcoming: [] })
      .mockResolvedValueOnce({ active: [taskB], upcoming: [] });
    vi.mocked(api.completeTask)
      .mockImplementationOnce(() => new Promise((_, reject) => { rejectTaskB = reject; }))
      .mockResolvedValueOnce({
        completed: { ...taskC, isCompleted: true, completedAt: '2026-03-15T01:00:00.000Z' },
        nextInstance: null,
      } as any);

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.active).toHaveLength(2));

    act(() => {
      result.current.completeTask(taskB.id);
    });

    await waitFor(() => expect(result.current.active).toEqual([taskC]));

    act(() => {
      result.current.completeTask(taskC.id);
    });

    await waitFor(() => expect(result.current.active).toHaveLength(0));

    act(() => {
      rejectTaskB(new Error('Network error'));
    });

    await waitFor(() => expect(result.current.active).toEqual([taskB]));
    expect(result.current.active).not.toContainEqual(taskC);
    expect(result.current.error).toBe('Network error');
  });

  it('should restore only the deleted task on delete failure instead of stale list snapshots', async () => {
    const taskC = {
      id: '3',
      title: 'Task C',
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
      subtasks: [],
    } as any;

    let rejectDeleteB!: (error: Error) => void;
    vi.mocked(api.listTasks)
      .mockResolvedValueOnce({ active: [taskB, taskC], upcoming: [] })
      .mockResolvedValueOnce({ active: [taskB], upcoming: [] });
    vi.mocked(api.deleteTask)
      .mockImplementationOnce(() => new Promise((_, reject) => { rejectDeleteB = reject; }));
    vi.mocked(api.completeTask)
      .mockResolvedValueOnce({
        completed: { ...taskC, isCompleted: true, completedAt: '2026-03-15T01:00:00.000Z' },
        nextInstance: null,
      } as any);

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.active).toHaveLength(2));

    // Delete taskB — optimistically removed, active = [taskC]
    act(() => {
      result.current.deleteTask(taskB.id);
    });

    await waitFor(() => expect(result.current.active).toEqual([taskC]));

    // Complete taskC while delete is in flight — active = []
    act(() => {
      result.current.completeTask(taskC.id);
    });

    await waitFor(() => expect(result.current.active).toHaveLength(0));

    // Reject taskB's delete — only taskB should be restored
    act(() => {
      rejectDeleteB(new Error('Network error'));
    });

    await waitFor(() => expect(result.current.active).toEqual([taskB]));
    expect(result.current.active).not.toContainEqual(taskC);
    expect(result.current.error).toBe('Network error');
  });

  it('should clear pending confirmation when the pending task is deleted', async () => {
    vi.mocked(api.listTasks).mockResolvedValue({ active: [parentTask], upcoming: [] });
    vi.mocked(api.completeTask).mockRejectedValue(new Error('subtasks_confirmation_required'));
    vi.mocked(api.deleteTask).mockResolvedValue(undefined);

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.active).toHaveLength(1));

    act(() => {
      result.current.completeTask(parentTask.id);
    });

    await waitFor(() => expect(result.current.pendingCompletionTask?.id).toBe(parentTask.id));

    act(() => {
      result.current.deleteTask(parentTask.id);
    });

    await waitFor(() => {
      expect(result.current.active).toEqual([]);
      expect(result.current.pendingCompletionTask).toBeNull();
    });
  });

  it('should clear pending confirmation when refresh removes the pending task', async () => {
    vi.mocked(api.listTasks)
      .mockResolvedValueOnce({ active: [parentTask, taskB], upcoming: [] })
      .mockResolvedValueOnce({ active: [taskB], upcoming: [] });
    vi.mocked(api.completeTask).mockRejectedValue(new Error('subtasks_confirmation_required'));

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.active).toHaveLength(2));

    act(() => {
      result.current.completeTask(parentTask.id);
    });

    await waitFor(() => expect(result.current.pendingCompletionTask?.id).toBe(parentTask.id));

    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.active).toEqual([taskB]);
      expect(result.current.pendingCompletionTask).toBeNull();
    });
  });

  it('optimistically reorders active tasks immediately', async () => {
    const taskC = {
      ...taskB,
      id: '3',
      title: 'Task C',
    } as any;

    vi.mocked(api.listTasks)
      .mockResolvedValueOnce({ active: [parentTask, taskB, taskC], upcoming: [] })
      .mockResolvedValueOnce({ active: [taskB, parentTask, taskC], upcoming: [] });
    (api as Record<string, any>).reorderTasks.mockResolvedValue(undefined);

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.active).toHaveLength(3));

    act(() => {
      (result.current as any).reorderTasks([taskB.id, parentTask.id, taskC.id]);
    });

    expect(result.current.active.map((task) => task.id)).toEqual([taskB.id, parentTask.id, taskC.id]);
    await waitFor(() => expect((api as Record<string, any>).reorderTasks).toHaveBeenCalledWith([
      taskB.id,
      parentTask.id,
      taskC.id,
    ]));
  });

  it('restores prior order and surfaces the error when reorder fails', async () => {
    const taskC = {
      ...taskB,
      id: '3',
      title: 'Task C',
    } as any;

    vi.mocked(api.listTasks)
      .mockResolvedValueOnce({ active: [parentTask, taskB, taskC], upcoming: [] })
      .mockResolvedValueOnce({ active: [parentTask, taskB, taskC], upcoming: [] });
    (api as Record<string, any>).reorderTasks.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.active).toHaveLength(3));

    act(() => {
      (result.current as any).reorderTasks([taskB.id, parentTask.id, taskC.id]);
    });

    expect(result.current.active.map((task) => task.id)).toEqual([taskB.id, parentTask.id, taskC.id]);

    await waitFor(() => expect(result.current.active.map((task) => task.id)).toEqual([
      parentTask.id,
      taskB.id,
      taskC.id,
    ]));
    expect(result.current.error).toBe('Network error');
  });

  it('refreshes after stale server rejection and snaps back cleanly', async () => {
    const taskC = {
      ...taskB,
      id: '3',
      title: 'Task C',
    } as any;

    vi.mocked(api.listTasks)
      .mockResolvedValueOnce({ active: [parentTask, taskB, taskC], upcoming: [] })
      .mockResolvedValueOnce({ active: [taskC, parentTask, taskB], upcoming: [] });
    (api as Record<string, any>).reorderTasks.mockRejectedValue(new Error('invalid reorder payload'));

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.active).toHaveLength(3));

    act(() => {
      (result.current as any).reorderTasks([taskB.id, parentTask.id, taskC.id]);
    });

    await waitFor(() => expect(result.current.active.map((task) => task.id)).toEqual([
      taskC.id,
      parentTask.id,
      taskB.id,
    ]));
    expect(result.current.error).toBe('invalid reorder payload');
  });
});
