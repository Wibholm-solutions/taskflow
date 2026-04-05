# Undo Complete — Design Spec

**Issue:** [#55](https://github.com/Wibholm-solutions/taskflow/issues/55)
**Date:** 2026-04-05

## Problem

Completing a task via swipe is instant and irreversible. Accidental swipes happen, especially on mobile. The user needs a short grace period to undo a mistaken completion.

## Approach

**Frontend delay pattern.** The API call is deferred by 5 seconds after the user swipes to complete. During that window, a snackbar offers an "Undo" button. If undone, the timer is cancelled and the task is restored — the backend never knows the completion happened. If the window expires, the API fires as normal.

This avoids any backend changes. No "uncomplete" endpoint, no reversal of recurrence side effects.

## Components

### 1. Completion Queue (in `useTasks` hook)

A `useRef`-based queue inside `useTasks.ts` tracks pending completions.

**Each entry:**
- `taskId: string`
- `taskSnapshot: Task` — full task object for restoration
- `originalList: 'active' | 'upcoming'`
- `originalIndex: number`
- `completeRemainingSubtasks: boolean`
- `timerId: ReturnType<typeof setTimeout>`

**Operations:**
- `enqueue(task, list, index, options)` — start 5s timer, add to queue
- `undo(taskId)` — cancel timer, restore task via `restoreTaskInList()`, remove from queue
- `flush()` — fire all pending API calls immediately (for `beforeunload`)

**Modified `completeTaskRequest` flow:**
1. Optimistic removal (as today)
2. Check for incomplete subtasks client-side — if found, show modal and wait for confirmation
3. After confirmation (or if no subtasks), enqueue instead of calling API
4. Timer callback: call `api.completeTask()`, then `refresh()`, remove from queue
5. Error in API call: restore task, show error toast (as today)

**Flush on unload:**
- Register `beforeunload` listener
- On fire: iterate queue, call completions via `fetch` with `keepalive: true`
- Clean up listener on unmount

### 2. Snackbar Component

**File:** `client/src/components/CompletionSnackbar.tsx`

**Props:**
- `pendingCompletions: PendingCompletion[]` — from the completion queue
- `onUndo: (taskId: string) => void`

**Behavior:**
- Renders at viewport bottom, fixed position, centered
- Each item: task title (truncated to ~30 chars), "Undo" text button, progress bar
- Max 3 visible — if 4th arrives, oldest is force-completed (fire its API call)
- Entry animation: slide up (CSS transition)
- Exit animation: fade out
- Progress bar: thin line at bottom, shrinks over 5s via CSS `animation: shrink 5s linear`

**Styling (TailwindCSS):**
- Container: `fixed bottom-4 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-50`
- Item: `bg-gray-800 text-white rounded-lg px-4 py-3 shadow-lg` with min-width for readability
- Undo button: `text-green-400 font-medium` with hover state
- Progress bar: `bg-green-500 h-0.5` with shrink animation

### 3. Subtask Modal Interaction

No changes to the modal component. The flow order changes slightly:

1. User swipes task with incomplete subtasks
2. Optimistic removal (as today, already happens before modal in current code)
3. Modal appears with "Complete all" / "Cancel"
4. "Complete all" → enqueue with `completeRemainingSubtasks: true`
5. "Cancel" → restore task (as today)

The modal fires **before** the task enters the delay queue.

### 4. Recurring Task Timing

No backend changes. The only user-visible difference: recurring next instances appear ~5s after completion instead of immediately. This is because the API call (which triggers recurrence) is deferred.

Acceptable trade-off for undo capability.

## File Changes

| File | Change |
|------|--------|
| `client/src/hooks/useTasks.ts` | Add completion queue logic, modify `completeTaskRequest` to enqueue |
| `client/src/components/CompletionSnackbar.tsx` | New — snackbar component |
| `client/src/App.tsx` | Render `CompletionSnackbar`, pass queue state + undo handler |
| `client/src/types.ts` | Add `PendingCompletion` type |

## Edge Cases

- **Tab close during delay:** `beforeunload` flushes all pending completions via `keepalive` fetch
- **Rapid completions (>3):** Oldest snackbar force-completes, its API fires immediately
- **API error after delay:** Task restored to original position with error toast (existing behavior)
- **Undo then re-complete:** Works naturally — undo restores, swipe re-enqueues

## Testing

**Unit tests:**
- Enqueue starts timer, undo cancels and restores
- Flush fires all pending immediately
- Max 3 cap force-completes oldest
- `completeRemainingSubtasks` flag preserved through queue

**E2E tests:**
- Complete task → snackbar appears → click undo → task back in list
- Complete task → wait 5s → task gone from server
- Complete recurring task → wait 5s → next instance appears
- Complete 3 tasks → 3 snackbars visible
