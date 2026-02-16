// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTasks } from '../src/hooks/useTasks';
import { api } from '../src/services/api';

vi.mock('../src/services/api');

describe('useTasks', () => {
  beforeEach(() => {
    vi.mocked(api.listTasks).mockResolvedValue({ active: [], upcoming: [] });
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
});
