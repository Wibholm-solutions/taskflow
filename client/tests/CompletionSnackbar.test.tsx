// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CompletionSnackbar } from '../src/components/CompletionSnackbar';
import type { PendingCompletion } from '../src/types';

function makePending(overrides: Partial<PendingCompletion> & { taskId: string }): PendingCompletion {
  return {
    taskSnapshot: { id: overrides.taskId, title: `Task ${overrides.taskId}` } as any,
    originalList: 'active',
    originalIndex: 0,
    completeRemainingSubtasks: false,
    timerId: 0 as any,
    ...overrides,
  };
}

describe('CompletionSnackbar', () => {
  it('renders nothing when no pending completions', () => {
    const { container } = render(
      <CompletionSnackbar pendingCompletions={[]} onUndo={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders a snackbar for each pending completion', () => {
    const items = [makePending({ taskId: '1' }), makePending({ taskId: '2' })];
    render(<CompletionSnackbar pendingCompletions={items} onUndo={vi.fn()} />);

    expect(screen.getByText('Task 1')).toBeTruthy();
    expect(screen.getByText('Task 2')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /undo/i })).toHaveLength(2);
  });

  it('calls onUndo with the task ID when undo is clicked', () => {
    const onUndo = vi.fn();
    const items = [makePending({ taskId: '42' })];
    render(<CompletionSnackbar pendingCompletions={items} onUndo={onUndo} />);

    fireEvent.click(screen.getByRole('button', { name: /undo/i }));
    expect(onUndo).toHaveBeenCalledWith('42');
  });

  it('truncates long task titles', () => {
    const longTitle = 'A'.repeat(50);
    const items = [makePending({
      taskId: '1',
      taskSnapshot: { id: '1', title: longTitle } as any,
    })];
    render(<CompletionSnackbar pendingCompletions={items} onUndo={vi.fn()} />);

    const displayed = screen.getByTestId('snackbar-title-1').textContent!;
    expect(displayed.length).toBeLessThanOrEqual(33); // 30 chars + "..."
  });
});
