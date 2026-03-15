import { useState, useEffect, useRef } from 'react';
import type {
  Task,
  Priority,
  RecurrenceRule,
  SubtaskInput,
  SubtaskMutationInput,
  TaskFormInput,
} from '../types';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (input: TaskFormInput) => void;
  onDelete?: () => void;
  editTask?: Task | null;
}

const WEEKDAY_LABELS = ['S', 'M', 'T', 'O', 'T', 'F', 'L'];

interface EditableSubtask {
  id: string | null;
  title: string;
  isCompleted: boolean;
  initialTitle: string;
  initialCompleted: boolean;
}

function createEditableSubtask(
  subtask?: Partial<Pick<EditableSubtask, 'id' | 'title' | 'isCompleted' | 'initialTitle' | 'initialCompleted'>>
): EditableSubtask {
  return {
    id: subtask?.id ?? null,
    title: subtask?.title ?? '',
    isCompleted: subtask?.isCompleted ?? false,
    initialTitle: subtask?.initialTitle ?? subtask?.title ?? '',
    initialCompleted: subtask?.initialCompleted ?? subtask?.isCompleted ?? false,
  };
}

export function TaskModal({ isOpen, onClose, onSave, onDelete, editTask }: TaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [priority, setPriority] = useState<Priority>('default');
  const [showExtra, setShowExtra] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  const [recurrenceType, setRecurrenceType] = useState<'none' | 'weekdays' | 'days_after' | 'months_after'>('none');
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([]);
  const [recurrenceInterval, setRecurrenceInterval] = useState(7);
  const [subtasks, setSubtasks] = useState<EditableSubtask[]>([]);
  const [deletedSubtaskIds, setDeletedSubtaskIds] = useState<string[]>([]);

  const titleRef = useRef<HTMLInputElement>(null);

  // Adjust modal position when iOS virtual keyboard appears/disappears
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const handleViewportChange = () => {
      const offset = window.innerHeight - vv.height - vv.offsetTop;
      setKeyboardOffset(Math.max(0, offset));
    };

    vv.addEventListener('resize', handleViewportChange);
    vv.addEventListener('scroll', handleViewportChange);
    return () => {
      vv.removeEventListener('resize', handleViewportChange);
      vv.removeEventListener('scroll', handleViewportChange);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      if (editTask) {
        setTitle(editTask.title);
        setDescription(editTask.description || '');
        setDeadline(editTask.deadline || '');
        setPriority(editTask.priority);
        setSubtasks((editTask.subtasks ?? []).map((subtask) => createEditableSubtask({
          id: subtask.id,
          title: subtask.title,
          isCompleted: subtask.isCompleted,
        })));
        setDeletedSubtaskIds([]);
        if (editTask.recurrenceRule) {
          setRecurrenceType(editTask.recurrenceRule.type);
          if (editTask.recurrenceRule.type === 'weekdays') {
            setRecurrenceDays(editTask.recurrenceRule.days);
          } else {
            setRecurrenceInterval(editTask.recurrenceRule.interval);
          }
          setShowExtra(true);
        } else {
          setRecurrenceType('none');
          setRecurrenceDays([]);
          setRecurrenceInterval(7);
          setShowExtra(editTask.description || editTask.deadline || editTask.priority !== 'default' ? true : false);
        }
      } else {
        setTitle('');
        setDescription('');
        setDeadline('');
        setPriority('default');
        setShowExtra(false);
        setRecurrenceType('none');
        setRecurrenceDays([]);
        setRecurrenceInterval(7);
        setSubtasks([]);
        setDeletedSubtaskIds([]);
      }
    }
  }, [isOpen, editTask]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!title.trim()) return;

    let recurrenceRule: RecurrenceRule | undefined;
    if (recurrenceType === 'weekdays' && recurrenceDays.length > 0) {
      recurrenceRule = { type: 'weekdays', days: recurrenceDays };
    } else if (recurrenceType === 'days_after') {
      recurrenceRule = { type: 'days_after', interval: recurrenceInterval };
    } else if (recurrenceType === 'months_after') {
      recurrenceRule = { type: 'months_after', interval: recurrenceInterval };
    }

    const baseInput: TaskFormInput = {
      title: title.trim(),
      description: description.trim() || undefined,
      deadline: deadline || undefined,
      priority,
      recurrenceRule,
    };

    if (editTask) {
      const create: SubtaskInput[] = [];
      const update: NonNullable<SubtaskMutationInput['update']> = [];

      for (const subtask of subtasks) {
        const trimmedTitle = subtask.title.trim();

        if (!subtask.id) {
          if (trimmedTitle) {
            create.push({ title: trimmedTitle, isCompleted: subtask.isCompleted });
          }
          continue;
        }

        const subtaskUpdate: { id: string; title?: string; isCompleted?: boolean } = { id: subtask.id };
        if (trimmedTitle && trimmedTitle !== subtask.initialTitle) {
          subtaskUpdate.title = trimmedTitle;
        }
        if (subtask.isCompleted !== subtask.initialCompleted) {
          subtaskUpdate.isCompleted = subtask.isCompleted;
        }

        if (subtaskUpdate.title !== undefined || subtaskUpdate.isCompleted !== undefined) {
          update.push(subtaskUpdate);
        }
      }

      const subtasksInput: SubtaskMutationInput = {};
      if (create.length > 0) {
        subtasksInput.create = create;
      }
      if (update.length > 0) {
        subtasksInput.update = update;
      }
      if (deletedSubtaskIds.length > 0) {
        subtasksInput.delete = deletedSubtaskIds;
      }

      if (subtasksInput.create || subtasksInput.update || subtasksInput.delete) {
        baseInput.subtasks = subtasksInput;
      }
    } else {
      const create = subtasks
        .map((subtask) => ({
          title: subtask.title.trim(),
          isCompleted: subtask.isCompleted,
        }))
        .filter((subtask) => subtask.title.length > 0);

      if (create.length > 0) {
        baseInput.subtasks = create;
      }
    }

    onSave(baseInput);
  };

  const toggleWeekday = (day: number) => {
    setRecurrenceDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const updateSubtask = (index: number, patch: Partial<EditableSubtask>) => {
    setSubtasks((prev) => prev.map((subtask, currentIndex) => (
      currentIndex === index ? { ...subtask, ...patch } : subtask
    )));
  };

  const addSubtask = () => {
    setSubtasks((prev) => [...prev, createEditableSubtask()]);
  };

  const removeSubtask = (index: number) => {
    setSubtasks((prev) => {
      const target = prev[index];
      if (target?.id) {
        setDeletedSubtaskIds((deleted) => (
          deleted.includes(target.id as string) ? deleted : [...deleted, target.id as string]
        ));
      }

      return prev.filter((_, currentIndex) => currentIndex !== index);
    });
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      {/* Modal */}
      <div
        role="dialog"
        className="fixed left-0 right-0 z-50 bg-gray-800 rounded-t-2xl p-4 max-w-md mx-auto transform transition-transform"
        style={{ bottom: keyboardOffset, maxHeight: '85vh', overflowY: 'auto' }}
      >
        {/* Title input */}
        <input
          ref={titleRef}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          type="text"
          placeholder="Hvad skal du?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          className="w-full bg-transparent text-white text-lg font-medium outline-none border-b border-gray-700 pb-2 mb-4"
          maxLength={200}
        />

        {/* Extra fields toggle */}
        {!showExtra && (
          <button
            type="button"
            onClick={() => setShowExtra(true)}
            className="text-blue-400 text-sm mb-4 block"
          >
            Flere indstillinger
          </button>
        )}

        {showExtra && (
          <div className="space-y-4 mb-4">
            {/* Description */}
            <div>
              <label className="text-gray-400 text-xs block mb-1">Beskrivelse</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-gray-700 text-white rounded-lg p-2 text-sm outline-none resize-none"
                rows={2}
              />
            </div>

            {/* Deadline */}
            <div>
              <label className="text-gray-400 text-xs block mb-1">Deadline</label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full bg-gray-700 text-white rounded-lg p-2 text-sm outline-none"
              />
            </div>

            {/* Priority */}
            <div>
              <label className="text-gray-400 text-xs block mb-1">Prioritet</label>
              <div className="flex gap-2">
                {(['high', 'default', 'low'] as Priority[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      priority === p
                        ? p === 'high'
                          ? 'bg-red-600 text-white'
                          : p === 'low'
                          ? 'bg-gray-600 text-white'
                          : 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300'
                    }`}
                  >
                    {p === 'high' ? 'Høj' : p === 'default' ? 'Normal' : 'Lav'}
                  </button>
                ))}
              </div>
            </div>

            {/* Recurrence */}
            <div>
              <label className="text-gray-400 text-xs block mb-1">Gentagelse</label>
              <select
                value={recurrenceType}
                onChange={(e) => setRecurrenceType(e.target.value as any)}
                className="w-full bg-gray-700 text-white rounded-lg p-2 text-sm outline-none"
              >
                <option value="none">Ingen</option>
                <option value="weekdays">Faste ugedage</option>
                <option value="days_after">Hver X dage</option>
                <option value="months_after">Hver X måneder</option>
              </select>

              {recurrenceType === 'weekdays' && (
                <div className="flex gap-1 mt-2">
                  {WEEKDAY_LABELS.map((label, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleWeekday(i)}
                      className={`w-8 h-8 rounded-full text-xs font-medium ${
                        recurrenceDays.includes(i)
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 text-gray-400'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {(recurrenceType === 'days_after' || recurrenceType === 'months_after') && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-gray-400 text-sm">Hver</span>
                  <input
                    type="number"
                    min={1}
                    value={recurrenceInterval}
                    onChange={(e) => setRecurrenceInterval(parseInt(e.target.value) || 1)}
                    className="w-16 bg-gray-700 text-white rounded-lg p-2 text-sm outline-none text-center"
                  />
                  <span className="text-gray-400 text-sm">
                    {recurrenceType === 'days_after' ? 'dage' : 'måneder'}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-gray-400 text-xs block">Underopgaver</label>
            <button
              type="button"
              onClick={addSubtask}
              className="text-blue-400 text-sm"
            >
              Tilføj underopgave
            </button>
          </div>

          <div className="space-y-2">
            {subtasks.map((subtask, index) => {
              const trimmedTitle = subtask.title.trim();
              const checkboxLabel = trimmedTitle || 'underopgave';
              const deleteLabel = trimmedTitle || 'underopgave';

              return (
                <div key={subtask.id ?? `new-${index}`} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={subtask.isCompleted}
                    aria-label={`Mark "${checkboxLabel}" as completed`}
                    onChange={(e) => updateSubtask(index, { isCompleted: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-600 bg-gray-700"
                  />
                  <input
                    type="text"
                    value={subtask.title}
                    placeholder={subtask.id ? undefined : 'Ny underopgave'}
                    onChange={(e) => updateSubtask(index, { title: e.target.value })}
                    className="flex-1 rounded-lg bg-gray-700 px-3 py-2 text-sm text-white outline-none"
                    maxLength={200}
                  />
                  <button
                    type="button"
                    onClick={() => removeSubtask(index)}
                    aria-label={`Delete "${deleteLabel}"`}
                    className="rounded-lg px-2 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-700"
                  >
                    Slet
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {editTask && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium"
            >
              Slet
            </button>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg text-sm"
          >
            Annuller
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium"
          >
            Gem
          </button>
        </div>
      </div>
    </>
  );
}
