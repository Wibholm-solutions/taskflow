// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { TaskItem } from '../src/components/TaskItem';
import type { Task } from '../src/types';

const baseTask: Task = {
  id: '1',
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
  createdAt: '2026-02-16T00:00:00',
  updatedAt: '2026-02-16T00:00:00',
  subtasks: [],
};

describe('TaskItem', () => {
  it('renders task title', () => {
    render(<TaskItem task={baseTask} onComplete={() => {}} onDelete={() => {}} onTap={() => {}} />);
    expect(screen.getByText('Test task')).toBeTruthy();
  });

  it('shows red left border for high priority', () => {
    const task = { ...baseTask, priority: 'high' as const };
    const { container } = render(
      <TaskItem task={task} onComplete={() => {}} onDelete={() => {}} onTap={() => {}} />
    );
    expect(container.querySelector('[data-priority="high"]')).toBeTruthy();
  });

  it('shows deadline text for today', () => {
    const today = new Date().toISOString().split('T')[0];
    const task = { ...baseTask, deadline: today };
    render(<TaskItem task={task} onComplete={() => {}} onDelete={() => {}} onTap={() => {}} />);
    expect(screen.getByText('i dag')).toBeTruthy();
  });

  it('shows deadline text for tomorrow', () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const task = { ...baseTask, deadline: tomorrow };
    render(<TaskItem task={task} onComplete={() => {}} onDelete={() => {}} onTap={() => {}} />);
    expect(screen.getByText('i morgen')).toBeTruthy();
  });

  it('applies upcoming styling', () => {
    const { container } = render(
      <TaskItem task={baseTask} onComplete={() => {}} onDelete={() => {}} onTap={() => {}} upcoming />
    );
    expect(container.querySelector('[data-upcoming="true"]')).toBeTruthy();
  });

  it('shows recurrence indicator for recurring tasks', () => {
    const task = { ...baseTask, recurrenceRule: { type: 'days_after' as const, interval: 7 } };
    render(<TaskItem task={task} onComplete={() => {}} onDelete={() => {}} onTap={() => {}} />);
    expect(screen.getByText(/\u21BB/)).toBeTruthy(); // ↻ recurrence symbol
  });

  it('renders a drag handle for active tasks but not upcoming tasks', () => {
    const { rerender } = render(
      <TaskItem
        task={baseTask}
        onComplete={() => {}}
        onDelete={() => {}}
        onTap={() => {}}
        canDrag
      />
    );

    expect(screen.getByTestId(`task-drag-handle-${baseTask.id}`)).toBeTruthy();

    rerender(
      <TaskItem
        task={baseTask}
        onComplete={() => {}}
        onDelete={() => {}}
        onTap={() => {}}
        upcoming
      />
    );

    expect(screen.queryByTestId(`task-drag-handle-${baseTask.id}`)).toBeNull();
  });

  it('keeps handle clicks from opening the task editor', () => {
    const onTap = vi.fn();
    render(
      <TaskItem
        task={baseTask}
        onComplete={() => {}}
        onDelete={() => {}}
        onTap={onTap}
        canDrag
      />
    );

    fireEvent.click(screen.getByTestId(`task-drag-handle-${baseTask.id}`));
    expect(onTap).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Test task'));
    expect(onTap).toHaveBeenCalledWith(baseTask);
  });

  it('starts drag mode after a long press on the handle', () => {
    vi.useFakeTimers();
    const onTouchDragStart = vi.fn();

    render(
      <TaskItem
        task={baseTask}
        onComplete={() => {}}
        onDelete={() => {}}
        onTap={() => {}}
        canDrag
        onTouchDragStart={onTouchDragStart}
      />
    );

    fireEvent.touchStart(screen.getByTestId(`task-drag-handle-${baseTask.id}`), {
      touches: [{ clientX: 0, clientY: 0 }],
    });

    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(onTouchDragStart).toHaveBeenCalledWith(baseTask, expect.objectContaining({ clientX: 0, clientY: 0 }));
    vi.useRealTimers();
  });

  it('cancels touch drag timer when finger moves before 300ms', () => {
    vi.useFakeTimers();
    const onTouchDragStart = vi.fn();

    render(
      <TaskItem
        task={baseTask}
        onComplete={() => {}}
        onDelete={() => {}}
        onTap={() => {}}
        canDrag
        onTouchDragStart={onTouchDragStart}
      />
    );

    const handle = screen.getByTestId(`task-drag-handle-${baseTask.id}`);

    fireEvent.touchStart(handle, {
      touches: [{ clientX: 50, clientY: 100 }],
    });

    // Move finger before 300ms
    fireEvent.touchMove(handle, {
      touches: [{ clientX: 50, clientY: 130 }],
    });

    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(onTouchDragStart).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
