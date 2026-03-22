import { TaskItem } from './TaskItem';
import { useState } from 'react';
import { useTouchDrag } from '../hooks/useTouchDrag';
import type { Task } from '../types';

interface TaskListProps {
  active: Task[];
  upcoming: Task[];
  loading: boolean;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onTap: (task: Task) => void;
  onReorder: (taskIds: string[]) => void;
}

export function TaskList({
  active,
  upcoming,
  loading,
  onComplete,
  onDelete,
  onTap,
  onReorder,
}: TaskListProps) {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  const getBucketKey = (task: Task) => {
    const urgency = task.deadline && task.deadline <= today ? `due:${task.deadline}` : 'active';
    return `${urgency}:${task.priority}`;
  };

  const { dragState, handleTouchDragStart } = useTouchDrag({
    items: active,
    getBucketKey,
    onReorder,
  });

  const handleDrop = (targetTask: Task) => {
    if (!draggedTaskId || draggedTaskId === targetTask.id) {
      setDraggedTaskId(null);
      return;
    }

    const draggedTask = active.find((task) => task.id === draggedTaskId);
    if (!draggedTask) {
      setDraggedTaskId(null);
      return;
    }

    const targetBucket = getBucketKey(targetTask);
    if (getBucketKey(draggedTask) !== targetBucket) {
      setDraggedTaskId(null);
      return;
    }

    const bucketTasks = active.filter((task) => getBucketKey(task) === targetBucket);
    const reorderedBucketIds = bucketTasks.map((task) => task.id).filter((id) => id !== draggedTaskId);
    const targetIndex = reorderedBucketIds.indexOf(targetTask.id);
    reorderedBucketIds.splice(targetIndex + 1, 0, draggedTaskId);

    setDraggedTaskId(null);
    onReorder(reorderedBucketIds);
  };

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
          {active.map((task, index) => (
            <div key={task.id}>
              {dragState && dragState.overIndex === index && (
                <div data-testid="drag-indicator" className="h-0.5 bg-blue-500 rounded my-1" />
              )}
              <div
                data-testid={`task-${task.id}`}
                data-bucket={getBucketKey(task)}
                data-dragging={dragState?.draggedId === task.id ? 'true' : undefined}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => handleDrop(task)}
                className={dragState?.draggedId === task.id ? 'scale-[1.02] shadow-lg opacity-70' : ''}
              >
                <TaskItem
                  task={task}
                  onComplete={onComplete}
                  onDelete={onDelete}
                  onTap={onTap}
                  canDrag
                  onDragStart={(dragTask) => setDraggedTaskId(dragTask.id)}
                  onDragEnd={() => setDraggedTaskId(null)}
                  onTouchDragStart={handleTouchDragStart}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {upcoming.length > 0 && (
        <div className={active.length > 0 ? 'mt-6' : ''}>
          <h2 className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-2">
            Kommende
          </h2>
          {upcoming.map((task) => (
            <div key={task.id} data-testid={`task-${task.id}`}>
              <TaskItem
                task={task}
                onComplete={onComplete}
                onDelete={onDelete}
                onTap={onTap}
                upcoming
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
