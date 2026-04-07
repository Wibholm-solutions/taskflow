// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTasks } from '../src/hooks/useTasks';
import { api } from '../src/services/api';
import type { Task } from '../src/types';

vi.mock('../src/services/api');

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

const parentTask = makeTask({
  id: '1',
  title: 'Parent task',
  subtasks: [
    {
      id: 'subtask-1',
      taskId: '1',
      title: 'Open subtask',
      isCompleted: false,
      completedAt: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ],
});

const taskB = makeTask({ id: '2', title: 'Task B' });

describe('useTasks', () => {
  beforeEach(() => {
    vi.mocked(api.listTasks).mockReset();
    vi.mocked(api.completeTask).mockReset();
    vi.mocked(api.deleteTask).mockReset();
    vi.mocked(api.createTask).mockReset();
    vi.mocked(api.updateTask).mockReset();
    vi.mocked(api.reorderTasks).mockReset();
    vi.mocked(api.listTasks).mockResolvedValue({ active: [], upcoming: [] });
  });

  it('fetches tasks on mount', async () => {
    vi.mocked(api.listTasks).mockResolvedValue({
      active: [makeTask({ id: '1', title: 'Task 1' })],
      upcoming: [makeTask({ id: '2', title: 'Upcoming' })],
    });

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.active).toHaveLength(1);
    expect(result.current.active[0].title).toBe('Task 1');
    expect(result.current.upcoming).toHaveLength(1);
  });

  it('sets error when fetch fails', async () => {
    vi.mocked(api.listTasks).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.error).toBe('Network error'));
    expect(result.current.loading).toBe(false);
  });

  it('creates a task and refreshes', async () => {
    const newTask = makeTask({ id: 'new-1', title: 'New Task' });
    vi.mocked(api.createTask).mockResolvedValue(newTask);
    vi.mocked(api.listTasks)
      .mockResolvedValueOnce({ active: [], upcoming: [] })
      .mockResolvedValueOnce({ active: [newTask], upcoming: [] });

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let created: Task | undefined;
    await act(async () => {
      created = await result.current.createTask({ title: 'New Task' });
    });

    expect(created).toEqual(newTask);
    expect(vi.mocked(api.createTask)).toHaveBeenCalledWith({ title: 'New Task' });
    await waitFor(() => expect(result.current.active).toHaveLength(1));
  });

  it('sets error when create fails', async () => {
    vi.mocked(api.createTask).mockRejectedValue(new Error('Validation error'));

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      try {
        await result.current.createTask({ title: '' });
      } catch {
        // expected
      }
    });

    expect(result.current.error).toBe('Validation error');
  });

  it('updates a task and refreshes', async () => {
    const task = makeTask({ id: '1', title: 'Original' });
    const updated = makeTask({ id: '1', title: 'Updated' });
    vi.mocked(api.listTasks)
      .mockResolvedValueOnce({ active: [task], upcoming: [] })
      .mockResolvedValueOnce({ active: [updated], upcoming: [] });
    vi.mocked(api.updateTask).mockResolvedValue(updated);

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.active).toHaveLength(1));

    await act(async () => {
      await result.current.updateTask('1', { title: 'Updated' });
    });

    expect(vi.mocked(api.updateTask)).toHaveBeenCalledWith('1', { title: 'Updated' });
    await waitFor(() => expect(result.current.active[0].title).toBe('Updated'));
  });

  it('rolls back state when update fails', async () => {
    const task = makeTask({ id: '1', title: 'Original' });
    vi.mocked(api.listTasks).mockResolvedValue({ active: [task], upcoming: [] });
    vi.mocked(api.updateTask).mockRejectedValue(new Error('Update failed'));

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.active).toHaveLength(1));

    await act(async () => {
      try {
        await result.current.updateTask('1', { title: 'Updated' });
      } catch {
        // expected
      }
    });

    expect(result.current.error).toBe('Update failed');
    expect(result.current.active[0].title).toBe('Original');
  });

  it('optimistically removes task on complete (simple task)', async () => {
    const task = makeTask({ id: '1', title: 'Simple' });
    vi.mocked(api.listTasks).mockResolvedValue({ active: [task], upcoming: [] });

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.active).toHaveLength(1));

    act(() => {
      result.current.completeTask('1');
    });

    // Task removed immediately from UI, queued for undo
    expect(result.current.active).toHaveLength(0);
    expect(result.current.pendingCompletions).toHaveLength(1);
  });

  it('surfaces subtask confirmation for tasks with open subtasks', async () => {
    vi.mocked(api.listTasks).mockResolvedValue({ active: [parentTask], upcoming: [] });
    vi.mocked(api.completeTask).mockRejectedValue(new Error('subtasks_confirmation_required'));

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.active).toHaveLength(1));

    act(() => {
      result.current.completeTask(parentTask.id);
    });

    expect(result.current.active).toHaveLength(0);

    await waitFor(() => expect(result.current.pendingCompletionTask?.id).toBe(parentTask.id));
    expect(result.current.active).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it('confirms aggregate completion and enqueues with completeRemainingSubtasks', async () => {
    vi.mocked(api.listTasks).mockResolvedValue({ active: [parentTask], upcoming: [] });
    vi.mocked(api.completeTask).mockRejectedValue(new Error('subtasks_confirmation_required'));

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.active).toHaveLength(1));

    act(() => {
      result.current.completeTask(parentTask.id);
    });

    await waitFor(() => expect(result.current.pendingCompletionTask?.id).toBe(parentTask.id));

    act(() => {
      result.current.confirmPendingCompletion();
    });

    // After confirm, the task is removed from active and queued for completion via undo queue
    expect(result.current.active).toHaveLength(0);
    expect(result.current.pendingCompletions).toHaveLength(1);
    expect(result.current.pendingCompletions[0].completeRemainingSubtasks).toBe(true);
  });

  it('cancels pending aggregate completion and keeps task', async () => {
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

  it('optimistically removes and rolls back on delete failure', async () => {
    const task = makeTask({ id: '1', title: 'Delete me' });
    vi.mocked(api.listTasks).mockResolvedValue({ active: [task], upcoming: [] });
    vi.mocked(api.deleteTask).mockRejectedValue(new Error('Delete failed'));

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.active).toHaveLength(1));

    act(() => {
      result.current.deleteTask('1');
    });

    expect(result.current.active).toHaveLength(0);

    await waitFor(() => expect(result.current.active).toHaveLength(1));
    expect(result.current.error).toBe('Delete failed');
  });

  it('deleting a task clears its pending confirmation', async () => {
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

  it('optimistically reorders active tasks', async () => {
    const taskC = makeTask({ id: '3', title: 'Task C' });
    vi.mocked(api.listTasks)
      .mockResolvedValueOnce({ active: [parentTask, taskB, taskC], upcoming: [] })
      .mockResolvedValueOnce({ active: [taskB, parentTask, taskC], upcoming: [] });
    vi.mocked(api.reorderTasks).mockResolvedValue(undefined);

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.active).toHaveLength(3));

    act(() => {
      result.current.reorderTasks([taskB.id, parentTask.id, taskC.id]);
    });

    expect(result.current.active.map((t) => t.id)).toEqual([taskB.id, parentTask.id, taskC.id]);
    await waitFor(() =>
      expect(vi.mocked(api.reorderTasks)).toHaveBeenCalledWith([taskB.id, parentTask.id, taskC.id]),
    );
  });

  it('restores prior order when reorder fails', async () => {
    const taskC = makeTask({ id: '3', title: 'Task C' });
    vi.mocked(api.listTasks)
      .mockResolvedValueOnce({ active: [parentTask, taskB, taskC], upcoming: [] })
      .mockResolvedValueOnce({ active: [parentTask, taskB, taskC], upcoming: [] });
    vi.mocked(api.reorderTasks).mockRejectedValue(new Error('Reorder failed'));

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.active).toHaveLength(3));

    act(() => {
      result.current.reorderTasks([taskB.id, parentTask.id, taskC.id]);
    });

    expect(result.current.active.map((t) => t.id)).toEqual([taskB.id, parentTask.id, taskC.id]);

    await waitFor(() =>
      expect(result.current.active.map((t) => t.id)).toEqual([parentTask.id, taskB.id, taskC.id]),
    );
    expect(result.current.error).toBe('Reorder failed');
  });

  it('clearError clears the error state', async () => {
    vi.mocked(api.listTasks).mockRejectedValueOnce(new Error('fail'));

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.error).toBe('fail'));

    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeNull();
  });

  it('refresh can be called manually', async () => {
    vi.mocked(api.listTasks)
      .mockResolvedValueOnce({ active: [], upcoming: [] })
      .mockResolvedValueOnce({ active: [makeTask()], upcoming: [] });

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.active).toHaveLength(0);

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.active).toHaveLength(1);
  });
});
