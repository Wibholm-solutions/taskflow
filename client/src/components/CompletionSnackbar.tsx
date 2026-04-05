import type { PendingCompletion } from '../types';

const UNDO_DELAY_MS = 5000;
const MAX_TITLE_LENGTH = 30;

function truncateTitle(title: string): string {
  if (title.length <= MAX_TITLE_LENGTH) return title;
  return title.slice(0, MAX_TITLE_LENGTH) + '...';
}

interface CompletionSnackbarProps {
  pendingCompletions: PendingCompletion[];
  onUndo: (taskId: string) => void;
}

export function CompletionSnackbar({ pendingCompletions, onUndo }: CompletionSnackbarProps) {
  if (pendingCompletions.length === 0) return null;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-50 w-[min(90vw,360px)]">
      {pendingCompletions.map((entry) => (
        <div
          key={entry.taskId}
          role="status"
          className="bg-gray-800 text-white rounded-lg shadow-lg overflow-hidden animate-slide-up"
        >
          <div className="flex items-center justify-between px-4 py-3">
            <span
              className="text-sm truncate mr-3"
              data-testid={`snackbar-title-${entry.taskId}`}
            >
              {truncateTitle(entry.taskSnapshot.title)}
            </span>
            <button
              type="button"
              className="text-green-400 font-medium text-sm whitespace-nowrap"
              onClick={() => onUndo(entry.taskId)}
              aria-label="Undo"
            >
              Undo
            </button>
          </div>
          <div
            className="h-0.5 bg-green-500 origin-left"
            style={{ animation: `shrink ${UNDO_DELAY_MS}ms linear forwards` }}
          />
        </div>
      ))}
    </div>
  );
}
