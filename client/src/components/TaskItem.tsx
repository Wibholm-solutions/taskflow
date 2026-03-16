import { useSwipe } from '../hooks/useSwipe';
import type { Task } from '../types';

interface TaskItemProps {
  task: Task;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onTap: (task: Task) => void;
  upcoming?: boolean;
}

export function formatDeadline(deadline: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(deadline + 'T00:00:00');
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0) return `${Math.abs(diffDays)}d siden`;
  if (diffDays === 0) return 'i dag';
  if (diffDays === 1) return 'i morgen';
  if (diffDays <= 7) return `om ${diffDays} dage`;

  return target.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });
}

const PRIORITY_BORDER: Record<string, string> = {
  high: 'border-l-red-500',
  default: 'border-l-blue-500',
  low: 'border-l-gray-500',
};

const PRIORITY_BADGE: Record<string, string> = {
  high: 'text-red-400',
  low: 'text-gray-400',
};

export function TaskItem({ task, onComplete, onDelete, onTap, upcoming }: TaskItemProps) {
  const { ref, offset, isSwiping } = useSwipe({
    onSwipeRight: () => onComplete(task.id),
    onSwipeLeft: () => onDelete(task.id),
    threshold: 80,
  });
  const subtasks = task.subtasks ?? [];
  const subtaskCount = subtasks.length;
  const completedSubtaskCount = subtasks.filter((subtask) => subtask.isCompleted).length;

  const deadlineColor = task.deadline
    ? (() => {
        const today = new Date().toISOString().split('T')[0];
        if (task.deadline < today) return 'text-red-400';
        if (task.deadline === today) return 'text-yellow-400';
        return 'text-gray-400';
      })()
    : '';

  return (
    <div
      data-priority={task.priority}
      data-upcoming={upcoming ? 'true' : undefined}
      className={`relative overflow-hidden rounded-lg mb-2 ${upcoming ? 'opacity-60' : ''}`}
    >
      {/* Swipe background reveals */}
      <div className="absolute inset-0 flex">
        <div className="flex-1 bg-green-600 flex items-center pl-4">
          <span className="text-white text-lg">&#10003;</span>
        </div>
        <div className="flex-1 bg-red-600 flex items-center justify-end pr-4">
          <span className="text-white text-lg">&#10005;</span>
        </div>
      </div>

      {/* Task card */}
      <div
        ref={ref}
        onClick={() => onTap(task)}
        className={`relative bg-gray-800 border-l-4 ${PRIORITY_BORDER[task.priority] || PRIORITY_BORDER.default} p-3 cursor-pointer ${isSwiping ? '' : 'transition-transform'}`}
        style={{ transform: `translateX(${offset}px)` }}
      >
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <span className="text-white text-sm font-medium truncate block">
              {task.title}
            </span>
            <div className="flex items-center gap-2 mt-1 text-xs">
              {task.deadline && (
                <span className={deadlineColor}>{formatDeadline(task.deadline)}</span>
              )}
              {subtaskCount > 0 && (
                <>
                  <span className="text-gray-500" aria-label={`${subtaskCount} subtasks`}>
                    ≣
                  </span>
                  <span className="text-gray-300">{completedSubtaskCount}/{subtaskCount}</span>
                </>
              )}
              {task.recurrenceRule && (
                <span className="text-blue-400">&#x21BB;</span>
              )}
              {task.priority === 'low' && (
                <span className={PRIORITY_BADGE[task.priority] || ''}>
                  {task.priority}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
