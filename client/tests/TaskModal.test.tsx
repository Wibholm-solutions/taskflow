// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TaskModal } from '../src/components/TaskModal';

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
});
