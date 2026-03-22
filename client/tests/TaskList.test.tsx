// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { TaskList } from '../src/components/TaskList';
import type { Task } from '../src/types';

function createTask(overrides: Partial<Task>): Task {
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

describe('TaskList', () => {
  it('reorders tasks within the same active bucket', () => {
    const onReorder = vi.fn();
    const first = createTask({ id: 'a', title: 'A', priority: 'default' });
    const second = createTask({ id: 'b', title: 'B', priority: 'default', sortOrder: 1 });

    render(
      <TaskList
        active={[first, second]}
        upcoming={[]}
        loading={false}
        onComplete={() => {}}
        onDelete={() => {}}
        onTap={() => {}}
        onReorder={onReorder}
      />
    );

    fireEvent.dragStart(screen.getByTestId('task-drag-handle-a'));
    fireEvent.dragOver(screen.getByTestId('task-b'));
    fireEvent.drop(screen.getByTestId('task-b'));

    expect(onReorder).toHaveBeenCalledWith(['b', 'a']);
  });

  it('blocks cross-bucket drops', () => {
    const onReorder = vi.fn();
    const high = createTask({ id: 'high', title: 'High', priority: 'high' });
    const normal = createTask({ id: 'normal', title: 'Normal', priority: 'default' });

    render(
      <TaskList
        active={[high, normal]}
        upcoming={[]}
        loading={false}
        onComplete={() => {}}
        onDelete={() => {}}
        onTap={() => {}}
        onReorder={onReorder}
      />
    );

    fireEvent.dragStart(screen.getByTestId('task-drag-handle-high'));
    fireEvent.dragOver(screen.getByTestId('task-normal'));
    fireEvent.drop(screen.getByTestId('task-normal'));

    expect(onReorder).not.toHaveBeenCalled();
  });

  it('applies data-dragging attribute to dragged task after touch drag start', () => {
    vi.useFakeTimers();
    const first = createTask({ id: 'a', title: 'A', priority: 'default' });
    const second = createTask({ id: 'b', title: 'B', priority: 'default', sortOrder: 1 });

    render(
      <TaskList
        active={[first, second]}
        upcoming={[]}
        loading={false}
        onComplete={() => {}}
        onDelete={() => {}}
        onTap={() => {}}
        onReorder={() => {}}
      />
    );

    // Long-press on first task's drag handle
    fireEvent.touchStart(screen.getByTestId('task-drag-handle-a'), {
      touches: [{ clientX: 100, clientY: 30 }],
    });

    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(screen.getByTestId('task-a').getAttribute('data-dragging')).toBe('true');
    expect(screen.getByTestId('task-b').getAttribute('data-dragging')).toBeNull();

    vi.useRealTimers();
  });

  it('shows drag indicator at correct position during drag', () => {
    vi.useFakeTimers();
    const first = createTask({ id: 'a', title: 'A', priority: 'default' });
    const second = createTask({ id: 'b', title: 'B', priority: 'default', sortOrder: 1 });

    render(
      <TaskList
        active={[first, second]}
        upcoming={[]}
        loading={false}
        onComplete={() => {}}
        onDelete={() => {}}
        onTap={() => {}}
        onReorder={() => {}}
      />
    );

    // Long-press to start drag
    fireEvent.touchStart(screen.getByTestId('task-drag-handle-a'), {
      touches: [{ clientX: 100, clientY: 30 }],
    });

    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(screen.queryByTestId('drag-indicator')).toBeTruthy();

    vi.useRealTimers();
  });
});
