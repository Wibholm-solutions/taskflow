import { useState } from 'react';
import { useTasks } from './hooks/useTasks';
import { usePullToRefresh } from './hooks/usePullToRefresh';
import { TaskList } from './components/TaskList';
import { TaskModal } from './components/TaskModal';
import { FloatingAddButton } from './components/FloatingAddButton';
import { Toast } from './components/Toast';
import type { Task, CreateTaskInput } from './types';

export default function App() {
  const { active, upcoming, loading, error, createTask, completeTask, deleteTask, updateTask, clearError, refresh } = useTasks();
  const { pullDistance, isRefreshing } = usePullToRefresh({ onRefresh: refresh });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const handleTap = (task: Task) => {
    setEditingTask(task);
    setModalOpen(true);
  };

  const handleAdd = () => {
    setEditingTask(null);
    setModalOpen(true);
  };

  const handleSave = async (input: CreateTaskInput) => {
    if (editingTask) {
      await updateTask(editingTask.id, input);
    } else {
      await createTask(input);
    }
    setModalOpen(false);
    setEditingTask(null);
  };

  const handleDelete = async () => {
    if (editingTask) {
      await deleteTask(editingTask.id);
      setModalOpen(false);
      setEditingTask(null);
    }
  };

  return (
    <div className="bg-gray-900 min-h-screen">
      {/* Pull-to-refresh indicator */}
      {(pullDistance > 0 || isRefreshing) && (
        <div
          className="flex items-center justify-center transition-all"
          style={{ height: pullDistance > 0 ? pullDistance : 40 }}
        >
          <div className={`w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full ${isRefreshing ? 'animate-spin' : ''}`} />
        </div>
      )}

      <div className="max-w-md mx-auto px-4 py-6 pb-24">
        <h1 className="text-2xl font-bold text-white mb-6">TaskFlow</h1>
        <TaskList
          active={active}
          upcoming={upcoming}
          loading={loading}
          onComplete={completeTask}
          onDelete={deleteTask}
          onTap={handleTap}
        />
      </div>
      <FloatingAddButton onClick={handleAdd} />
      <TaskModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingTask(null); }}
        onSave={handleSave}
        onDelete={editingTask ? handleDelete : undefined}
        editTask={editingTask}
      />
      {error && <Toast message={error} onDismiss={clearError} />}
    </div>
  );
}
