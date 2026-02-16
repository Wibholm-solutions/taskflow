// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
  createdAt: '2026-02-16T00:00:00',
  updatedAt: '2026-02-16T00:00:00',
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
});
