import { TaskItem } from './TaskItem';
import type { Task } from '../types';

interface TaskListProps {
  active: Task[];
  upcoming: Task[];
  loading: boolean;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onTap: (task: Task) => void;
}

export function TaskList({ active, upcoming, loading, onComplete, onDelete, onTap }: TaskListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (active.length === 0 && upcoming.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-3">&#10003;</div>
        <p className="text-gray-400">Ingen opgaver endnu</p>
        <p className="text-gray-500 text-sm mt-1">Tryk + for at oprette en</p>
      </div>
    );
  }

  return (
    <div>
      {active.length > 0 && (
        <div>
          <h2 className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-2">
            Aktive
          </h2>
          {active.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onComplete={onComplete}
              onDelete={onDelete}
              onTap={onTap}
            />
          ))}
        </div>
      )}

      {upcoming.length > 0 && (
        <div className={active.length > 0 ? 'mt-6' : ''}>
          <h2 className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-2">
            Kommende
          </h2>
          {upcoming.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onComplete={onComplete}
              onDelete={onDelete}
              onTap={onTap}
              upcoming
            />
          ))}
        </div>
      )}
    </div>
  );
}
