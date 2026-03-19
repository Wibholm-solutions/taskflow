// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TaskModal } from '../src/components/TaskModal';
import { TaskItem } from '../src/components/TaskItem';
import type { Task } from '../src/types';

const baseTask: Task = {
  id: 'task-1',
  title: 'Existing',
  description: 'Desc',
  deadline: '2026-03-01',
  priority: 'high',
  isCompleted: false,
  completedAt: null,
  notBefore: null,
  recurrenceGroupId: null,
  recurrenceRule: null,
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
  subtasks: [],
};

describe('TaskModal', () => {
  it('renders with title field', () => {
    render(<TaskModal isOpen={true} onClose={() => {}} onSave={() => {}} />);
    const input = screen.getByPlaceholderText('Hvad skal du?');
    expect(input).toBeTruthy();
  });

  it('calls onSave with title on submit', () => {
    const onSave = vi.fn();
    render(<TaskModal isOpen={true} onClose={() => {}} onSave={onSave} />);
    fireEvent.change(screen.getByPlaceholderText('Hvad skal du?'), {
      target: { value: 'New task' },
    });
    fireEvent.click(screen.getByText('Gem'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: 'New task' }));
  });

  it('does not call onSave with empty title', () => {
    const onSave = vi.fn();
    render(<TaskModal isOpen={true} onClose={() => {}} onSave={onSave} />);
    fireEvent.click(screen.getByText('Gem'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('toggles extra fields on click', () => {
    render(<TaskModal isOpen={true} onClose={() => {}} onSave={() => {}} />);
    expect(screen.queryByText('Prioritet')).toBeNull();
    fireEvent.click(screen.getByText('Flere indstillinger'));
    expect(screen.getByText('Prioritet')).toBeTruthy();
  });

  it('pre-fills fields when editing', () => {
    const task = {
      id: '1',
      title: 'Existing',
      description: 'Desc',
      deadline: '2026-03-01',
      priority: 'high' as const,
      recurrenceRule: null,
    };
    render(<TaskModal isOpen={true} onClose={() => {}} onSave={() => {}} editTask={task as any} />);
    expect((screen.getByPlaceholderText('Hvad skal du?') as HTMLInputElement).value).toBe('Existing');
  });

  it('shows delete button when editing', () => {
    const onDelete = vi.fn();
    render(
      <TaskModal
        isOpen={true}
        onClose={() => {}}
        onSave={() => {}}
        onDelete={onDelete}
        editTask={{ id: '1', title: 'X' } as any}
      />
    );
    expect(screen.getByText('Slet')).toBeTruthy();
  });

  it('is hidden when isOpen is false', () => {
    const { container } = render(<TaskModal isOpen={false} onClose={() => {}} onSave={() => {}} />);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('renders existing subtasks inline when editing', () => {
    render(
      <TaskModal
        isOpen={true}
        onClose={() => {}}
        onSave={() => {}}
        editTask={{
          ...baseTask,
          subtasks: [
            {
              id: 'subtask-1',
              taskId: 'task-1',
              title: 'First subtask',
              isCompleted: false,
              completedAt: null,
              createdAt: '2026-03-01T00:00:00.000Z',
              updatedAt: '2026-03-01T00:00:00.000Z',
            },
            {
              id: 'subtask-2',
              taskId: 'task-1',
              title: 'Done subtask',
              isCompleted: true,
              completedAt: '2026-03-01T12:00:00.000Z',
              createdAt: '2026-03-01T00:00:00.000Z',
              updatedAt: '2026-03-01T12:00:00.000Z',
            },
          ],
        }}
      />
    );

    expect(screen.getByDisplayValue('First subtask')).toBeTruthy();
    expect(screen.getByDisplayValue('Done subtask')).toBeTruthy();
  });

  it('submits subtask create, update, and delete mutations from inline edits', () => {
    const onSave = vi.fn();

    render(
      <TaskModal
        isOpen={true}
        onClose={() => {}}
        onSave={onSave}
        editTask={{
          ...baseTask,
          subtasks: [
            {
              id: 'subtask-1',
              taskId: 'task-1',
              title: 'Keep me',
              isCompleted: false,
              completedAt: null,
              createdAt: '2026-03-01T00:00:00.000Z',
              updatedAt: '2026-03-01T00:00:00.000Z',
            },
            {
              id: 'subtask-2',
              taskId: 'task-1',
              title: 'Remove me',
              isCompleted: false,
              completedAt: null,
              createdAt: '2026-03-01T00:00:00.000Z',
              updatedAt: '2026-03-01T00:00:00.000Z',
            },
          ],
        }}
      />
    );

    fireEvent.change(screen.getByDisplayValue('Keep me'), {
      target: { value: 'Updated subtask' },
    });
    fireEvent.click(screen.getByLabelText('Mark "Updated subtask" as completed'));
    fireEvent.click(screen.getByLabelText('Delete "Remove me"'));
    fireEvent.click(screen.getByText('Tilføj underopgave'));
    fireEvent.change(screen.getByPlaceholderText('Ny underopgave'), {
      target: { value: 'Brand new subtask' },
    });
    fireEvent.click(screen.getByText('Gem'));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Existing',
        subtasks: {
          create: [{ title: 'Brand new subtask', isCompleted: false }],
          update: [{ id: 'subtask-1', title: 'Updated subtask', isCompleted: true }],
          delete: ['subtask-2'],
        },
      })
    );
  });

  it('blocks save when an existing subtask title is cleared to blank', () => {
    const onSave = vi.fn();

    render(
      <TaskModal
        isOpen={true}
        onClose={() => {}}
        onSave={onSave}
        editTask={{
          ...baseTask,
          subtasks: [
            {
              id: 'subtask-1',
              taskId: 'task-1',
              title: 'Must stay named',
              isCompleted: false,
              completedAt: null,
              createdAt: '2026-03-01T00:00:00.000Z',
              updatedAt: '2026-03-01T00:00:00.000Z',
            },
          ],
        }}
      />
    );

    fireEvent.change(screen.getByDisplayValue('Must stay named'), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByText('Gem'));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('shows subtask overview progress on task cards', () => {
    render(
      <TaskItem
        task={{
          ...baseTask,
          subtasks: [
            {
              id: 'subtask-1',
              taskId: 'task-1',
              title: 'Done',
              isCompleted: true,
              completedAt: '2026-03-01T12:00:00.000Z',
              createdAt: '2026-03-01T00:00:00.000Z',
              updatedAt: '2026-03-01T12:00:00.000Z',
            },
            {
              id: 'subtask-2',
              taskId: 'task-1',
              title: 'Open',
              isCompleted: false,
              completedAt: null,
              createdAt: '2026-03-01T00:00:00.000Z',
              updatedAt: '2026-03-01T00:00:00.000Z',
            },
            {
              id: 'subtask-3',
              taskId: 'task-1',
              title: 'Done again',
              isCompleted: true,
              completedAt: '2026-03-01T13:00:00.000Z',
              createdAt: '2026-03-01T00:00:00.000Z',
              updatedAt: '2026-03-01T13:00:00.000Z',
            },
          ],
        }}
        onComplete={() => {}}
        onDelete={() => {}}
        onTap={() => {}}
      />
    );

    expect(screen.getByText('2/3')).toBeTruthy();
    expect(screen.getByLabelText('3 subtasks')).toBeTruthy();
  });

  it('pre-fills weekdays recurrence rule when editing', () => {
    const onSave = vi.fn();
    render(
      <TaskModal
        isOpen={true}
        onClose={() => {}}
        onSave={onSave}
        editTask={{ ...baseTask, recurrenceRule: { type: 'weekdays', days: [1, 5] } }}
      />
    );
    // Extra panel is open automatically when recurrence rule is present
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('weekdays');
    // Saving without changes must preserve the prefilled weekdays rule
    fireEvent.click(screen.getByText('Gem'));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ recurrenceRule: { type: 'weekdays', days: [1, 5] } })
    );
  });

  it('pre-fills interval recurrence rule when editing (days_after)', () => {
    const onSave = vi.fn();
    render(
      <TaskModal
        isOpen={true}
        onClose={() => {}}
        onSave={onSave}
        editTask={{ ...baseTask, recurrenceRule: { type: 'days_after', interval: 14 } }}
      />
    );
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('days_after');
    const intervalInput = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(intervalInput.value).toBe('14');
    fireEvent.click(screen.getByText('Gem'));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ recurrenceRule: { type: 'days_after', interval: 14 } })
    );
  });

  it('saves weekdays recurrence payload', () => {
    const onSave = vi.fn();
    render(<TaskModal isOpen={true} onClose={() => {}} onSave={onSave} />);
    fireEvent.change(screen.getByPlaceholderText('Hvad skal du?'), {
      target: { value: 'Repeat task' },
    });
    fireEvent.click(screen.getByText('Flere indstillinger'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'weekdays' } });
    // 'M' = Monday (index 1), 'F' = Friday (index 5) — unique labels in WEEKDAY_LABELS
    fireEvent.click(screen.getByText('M'));
    fireEvent.click(screen.getByText('F'));
    fireEvent.click(screen.getByText('Gem'));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ recurrenceRule: { type: 'weekdays', days: [1, 5] } })
    );
  });

  it('saves days_after recurrence payload', () => {
    const onSave = vi.fn();
    render(<TaskModal isOpen={true} onClose={() => {}} onSave={onSave} />);
    fireEvent.change(screen.getByPlaceholderText('Hvad skal du?'), {
      target: { value: 'Interval task' },
    });
    fireEvent.click(screen.getByText('Flere indstillinger'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'days_after' } });
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '10' } });
    fireEvent.click(screen.getByText('Gem'));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ recurrenceRule: { type: 'days_after', interval: 10 } })
    );
  });

  it('saves months_after recurrence payload', () => {
    const onSave = vi.fn();
    render(<TaskModal isOpen={true} onClose={() => {}} onSave={onSave} />);
    fireEvent.change(screen.getByPlaceholderText('Hvad skal du?'), {
      target: { value: 'Monthly task' },
    });
    fireEvent.click(screen.getByText('Flere indstillinger'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'months_after' } });
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3' } });
    fireEvent.click(screen.getByText('Gem'));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ recurrenceRule: { type: 'months_after', interval: 3 } })
    );
  });
});
