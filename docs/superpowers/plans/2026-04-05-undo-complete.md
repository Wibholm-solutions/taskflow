# Undo Complete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 5-second undo window after task completion — defer the API call and show a snackbar with an "Undo" button.

**Architecture:** Frontend-only change. The `completeTaskRequest` in `useTasks.ts` is refactored to push completions into a delay queue instead of calling the API immediately. A `CompletionSnackbar` component renders one snackbar per pending completion. On tab close, pending completions are flushed via `keepalive` fetch.

**Tech Stack:** React 18, TailwindCSS 4, Vitest (unit), Playwright (E2E)

**Spec:** `docs/superpowers/specs/2026-04-05-undo-complete-design.md`

---

### Task 1: Add PendingCompletion type

**Goal:** Define the type used by the completion queue and snackbar.

**Files:**
- Modify: `client/src/types.ts:80-87`

**Acceptance Criteria:**
- [ ] `PendingCompletion` type exported with all required fields
- [ ] No runtime changes — types only

**Verify:** `npx tsc --noEmit --project client/tsconfig.json` → no errors

**Steps:**

- [ ] **Step 1: Add the PendingCompletion interface**

Add at the end of `client/src/types.ts`:

```typescript
export interface PendingCompletion {
  taskId: string;
  taskSnapshot: Task;
  originalList: 'active' | 'upcoming';
  originalIndex: number;
  completeRemainingSubtasks: boolean;
  timerId: ReturnType<typeof setTimeout>;
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit --project client/tsconfig.json`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add client/src/types.ts
git commit -m "feat(undo-complete): add PendingCompletion type (#55)"
```

---

### Task 2: Refactor useTasks completion to use a delay queue

**Goal:** Replace the immediate API call in `completeTaskRequest` with a queue that delays 5 seconds before calling the API, and exposes `pendingCompletions` + `undoCompletion` for the snackbar.

**Files:**
- Modify: `client/src/hooks/useTasks.ts`
- Modify: `client/tests/useTasks.test.ts`

**Acceptance Criteria:**
- [ ] `completeTask` optimistically removes the task and starts a 5s timer
- [ ] After 5s, the API call fires and `refresh()` runs
- [ ] `undoCompletion(taskId)` cancels the timer and restores the task
- [ ] `pendingCompletions` array exposed for snackbar rendering
- [ ] `flushCompletions()` fires all pending immediately (for beforeunload)
- [ ] Max 3 pending — 4th force-completes the oldest
- [ ] All existing tests updated to account for the delayed API call
- [ ] Subtask confirmation modal still fires before entering the queue

**Verify:** `npx vitest run client/tests/useTasks.test.ts` → all pass

**Steps:**

- [ ] **Step 1: Write failing test — completion is delayed and can be undone**

Add to `client/tests/useTasks.test.ts`:

```typescript
describe('completion undo queue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should delay API call by 5 seconds and allow undo', async () => {
    const task = { id: '1', title: 'Task 1', priority: 'default', isCompleted: false, subtasks: [] } as any;
    vi.mocked(api.listTasks).mockResolvedValue({ active: [task], upcoming: [] });
    vi.mocked(api.completeTask).mockResolvedValue({
      completed: { ...task, isCompleted: true },
      nextInstance: null,
    });

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.active).toHaveLength(1));

    // Complete — task removed optimistically, API NOT called yet
    act(() => {
      result.current.completeTask('1');
    });

    expect(result.current.active).toHaveLength(0);
    expect(result.current.pendingCompletions).toHaveLength(1);
    expect(vi.mocked(api.completeTask)).not.toHaveBeenCalled();

    // Undo — task restored, timer cancelled
    act(() => {
      result.current.undoCompletion('1');
    });

    expect(result.current.active).toHaveLength(1);
    expect(result.current.active[0].id).toBe('1');
    expect(result.current.pendingCompletions).toHaveLength(0);

    // Advance past 5s — API should still not be called (was undone)
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(vi.mocked(api.completeTask)).not.toHaveBeenCalled();
  });

  it('should fire API call after 5 seconds if not undone', async () => {
    const task = { id: '1', title: 'Task 1', priority: 'default', isCompleted: false, subtasks: [] } as any;
    vi.mocked(api.listTasks)
      .mockResolvedValueOnce({ active: [task], upcoming: [] })
      .mockResolvedValueOnce({ active: [], upcoming: [] });
    vi.mocked(api.completeTask).mockResolvedValue({
      completed: { ...task, isCompleted: true },
      nextInstance: null,
    });

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.active).toHaveLength(1));

    act(() => {
      result.current.completeTask('1');
    });

    expect(vi.mocked(api.completeTask)).not.toHaveBeenCalled();

    // Advance 5s — API fires
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(vi.mocked(api.completeTask)).toHaveBeenCalledWith('1', undefined);
  });

  it('should force-complete oldest when 4th completion is enqueued', async () => {
    const tasks = [1, 2, 3, 4].map((n) => ({
      id: String(n), title: `Task ${n}`, priority: 'default', isCompleted: false, subtasks: [],
    } as any));
    vi.mocked(api.listTasks)
      .mockResolvedValueOnce({ active: tasks, upcoming: [] })
      .mockResolvedValue({ active: [], upcoming: [] });
    vi.mocked(api.completeTask).mockResolvedValue({
      completed: { isCompleted: true } as any,
      nextInstance: null,
    });

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.active).toHaveLength(4));

    // Complete 4 tasks in sequence
    act(() => {
      result.current.completeTask('1');
      result.current.completeTask('2');
      result.current.completeTask('3');
    });

    expect(result.current.pendingCompletions).toHaveLength(3);
    expect(vi.mocked(api.completeTask)).not.toHaveBeenCalled();

    // 4th completion triggers force-complete of oldest (#1)
    act(() => {
      result.current.completeTask('4');
    });

    expect(result.current.pendingCompletions).toHaveLength(3);
    expect(vi.mocked(api.completeTask)).toHaveBeenCalledWith('1', undefined);
  });

  it('should flush all pending completions via flushCompletions', async () => {
    const tasks = [1, 2].map((n) => ({
      id: String(n), title: `Task ${n}`, priority: 'default', isCompleted: false, subtasks: [],
    } as any));
    vi.mocked(api.listTasks).mockResolvedValue({ active: tasks, upcoming: [] });
    vi.mocked(api.completeTask).mockResolvedValue({
      completed: { isCompleted: true } as any,
      nextInstance: null,
    });

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.active).toHaveLength(2));

    act(() => {
      result.current.completeTask('1');
      result.current.completeTask('2');
    });

    expect(result.current.pendingCompletions).toHaveLength(2);

    act(() => {
      result.current.flushCompletions();
    });

    expect(vi.mocked(api.completeTask)).toHaveBeenCalledTimes(2);
    expect(result.current.pendingCompletions).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run client/tests/useTasks.test.ts`
Expected: New tests fail (pendingCompletions/undoCompletion/flushCompletions don't exist yet)

- [ ] **Step 3: Implement the completion queue in useTasks**

Modify `client/src/hooks/useTasks.ts`:

1. Add imports: `useRef` (already imported), add `PendingCompletion` from types.
2. Add state: `const [pendingCompletions, setPendingCompletions] = useState<PendingCompletion[]>([]);`
3. Add `UNDO_DELAY_MS = 5000` and `MAX_PENDING = 3` constants at the top of the file.
4. Add a `fireCompletion` helper function inside the hook that makes the actual API call (extracted from current `completeTaskRequest`):

```typescript
const fireCompletion = useCallback((taskId: string, completeRemainingSubtasks: boolean) => {
  const options = completeRemainingSubtasks ? { completeRemainingSubtasks: true } : undefined;
  api.completeTask(taskId, options).then(() => {
    setPendingCompletionTask((current) => (
      current?.id === taskId ? null : current
    ));
    refresh();
  }).catch((e: any) => {
    // Restore task from pendingCompletions snapshot if still available
    setPendingCompletions((prev) => {
      const entry = prev.find((p) => p.taskId === taskId);
      if (entry) {
        if (entry.originalList === 'active') {
          setActive((current) => restoreTaskInList(current, entry.taskSnapshot, entry.originalIndex));
        } else {
          setUpcoming((current) => restoreTaskInList(current, entry.taskSnapshot, entry.originalIndex));
        }
      }
      return prev.filter((p) => p.taskId !== taskId);
    });
    setPendingCompletionTask((current) => (
      current?.id === taskId ? null : current
    ));
    setError(e.message);
  });

  // Remove from pending list (already fired)
  setPendingCompletions((prev) => prev.filter((p) => p.taskId !== taskId));
}, [refresh]);
```

5. Refactor `completeTaskRequest` to enqueue instead of calling API directly:

```typescript
const completeTaskRequest = useCallback((id: string, confirmRemainingSubtasks = false) => {
  const taskLocation = findTaskLocation(active, upcoming, id);
  const task = taskLocation.task;

  if (!task || !taskLocation.list) return;

  setActive((prev) => prev.filter((t) => t.id !== id));
  setUpcoming((prev) => prev.filter((t) => t.id !== id));
  setError(null);

  // Check for subtask confirmation (still fires immediately, before queue)
  if (!confirmRemainingSubtasks && task.subtasks?.some((s: any) => !s.isCompleted)) {
    // Don't enqueue yet — let the 409 flow handle it via the existing API path
    api.completeTask(id, undefined).then(() => {
      setPendingCompletionTask((current) => current?.id === id ? null : current);
      refresh();
    }).catch((e: any) => {
      if (taskLocation.list === 'active' && task) {
        setActive((current) => restoreTaskInList(current, task, taskLocation.index));
      }
      if (taskLocation.list === 'upcoming' && task) {
        setUpcoming((current) => restoreTaskInList(current, task, taskLocation.index));
      }
      if (e.message === 'subtasks_confirmation_required' && task) {
        setPendingCompletionTask(task);
        return;
      }
      setPendingCompletionTask((current) => current?.id === id ? null : current);
      setError(e.message);
    });
    return;
  }

  // Enqueue with delay
  const timerId = setTimeout(() => {
    fireCompletion(id, confirmRemainingSubtasks);
  }, UNDO_DELAY_MS);

  const entry: PendingCompletion = {
    taskId: id,
    taskSnapshot: task,
    originalList: taskLocation.list,
    originalIndex: taskLocation.index,
    completeRemainingSubtasks: confirmRemainingSubtasks,
    timerId,
  };

  setPendingCompletions((prev) => {
    // Force-complete oldest if at max
    if (prev.length >= MAX_PENDING) {
      const oldest = prev[0];
      clearTimeout(oldest.timerId);
      fireCompletion(oldest.taskId, oldest.completeRemainingSubtasks);
      return [...prev.slice(1), entry];
    }
    return [...prev, entry];
  });
}, [active, upcoming, refresh, fireCompletion]);
```

6. Add `undoCompletion`:

```typescript
const undoCompletion = useCallback((taskId: string) => {
  setPendingCompletions((prev) => {
    const entry = prev.find((p) => p.taskId === taskId);
    if (!entry) return prev;

    clearTimeout(entry.timerId);

    if (entry.originalList === 'active') {
      setActive((current) => restoreTaskInList(current, entry.taskSnapshot, entry.originalIndex));
    } else {
      setUpcoming((current) => restoreTaskInList(current, entry.taskSnapshot, entry.originalIndex));
    }

    return prev.filter((p) => p.taskId !== taskId);
  });
}, []);
```

7. Add `flushCompletions`:

```typescript
const flushCompletions = useCallback(() => {
  setPendingCompletions((prev) => {
    for (const entry of prev) {
      clearTimeout(entry.timerId);
      const options = entry.completeRemainingSubtasks ? { completeRemainingSubtasks: true } : undefined;
      api.completeTask(entry.taskId, options);
    }
    return [];
  });
}, []);
```

8. Add `beforeunload` listener:

```typescript
useEffect(() => {
  const handleBeforeUnload = () => {
    for (const entry of pendingCompletions) {
      clearTimeout(entry.timerId);
      const body = entry.completeRemainingSubtasks
        ? JSON.stringify({ completeRemainingSubtasks: true })
        : undefined;
      const url = `/todo/api/tasks/${entry.taskId}/complete`;
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, body ? new Blob([body], { type: 'application/json' }) : undefined);
      } else {
        fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true });
      }
    }
  };
  window.addEventListener('beforeunload', handleBeforeUnload);
  return () => window.removeEventListener('beforeunload', handleBeforeUnload);
}, [pendingCompletions]);
```

9. Update the return object to include `pendingCompletions`, `undoCompletion`, `flushCompletions`.

**Important:** The subtask confirmation flow (tasks with open subtasks) still hits the API immediately to get the 409 response and trigger the modal. Only after the user confirms "Complete all" does the task enter the delay queue via `confirmPendingCompletion` → `completeTaskRequest(id, true)`. Tasks without subtasks go directly into the delay queue.

- [ ] **Step 4: Update existing tests for delayed completion**

The existing tests call `completeTask` and expect immediate API calls. Update them to use `vi.useFakeTimers()` and `vi.advanceTimersByTime(5000)` to trigger the delayed API call.

Key changes to existing tests:
- `'should optimistically remove task on complete'` — add fake timers, advance by 5s before checking API was called
- `'should rollback on complete failure'` — this test uses a task with no subtasks, so it enters the queue. Advance timer to trigger API, then check rollback.
- Tests involving `subtasks_confirmation_required` — these still work as-is because tasks with incomplete subtasks hit the API immediately (not queued)

For the subtask-related tests, the behavior changes: `completeTask('1')` on a task with incomplete subtasks now checks client-side before calling the API. Verify these tests still pass with the new flow.

- [ ] **Step 5: Run all tests**

Run: `npx vitest run client/tests/useTasks.test.ts`
Expected: All tests pass (new + existing)

- [ ] **Step 6: Commit**

```bash
git add client/src/hooks/useTasks.ts client/src/types.ts client/tests/useTasks.test.ts
git commit -m "feat(undo-complete): add completion delay queue with undo support (#55)"
```

---

### Task 3: Build CompletionSnackbar component

**Goal:** Render stacked snackbar items at the bottom of the viewport for each pending completion, with undo buttons and 5s progress bars.

**Files:**
- Create: `client/src/components/CompletionSnackbar.tsx`
- Create: `client/tests/CompletionSnackbar.test.tsx`

**Acceptance Criteria:**
- [ ] Renders one snackbar per pending completion
- [ ] Each shows task title (truncated), "Undo" button, progress bar
- [ ] Clicking "Undo" calls `onUndo(taskId)`
- [ ] Max 3 visible items
- [ ] Progress bar shrinks over 5s via CSS animation
- [ ] Proper accessibility: role="status", button labels

**Verify:** `npx vitest run client/tests/CompletionSnackbar.test.tsx` → all pass

**Steps:**

- [ ] **Step 1: Write failing tests**

Create `client/tests/CompletionSnackbar.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('calls onUndo with the task ID when undo is clicked', async () => {
    const onUndo = vi.fn();
    const items = [makePending({ taskId: '42' })];
    render(<CompletionSnackbar pendingCompletions={items} onUndo={onUndo} />);

    await userEvent.click(screen.getByRole('button', { name: /undo/i }));
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run client/tests/CompletionSnackbar.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement CompletionSnackbar**

Create `client/src/components/CompletionSnackbar.tsx`:

```tsx
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
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-50 w-[min(90vw,360px)]">
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
```

- [ ] **Step 4: Add CSS animations to the global stylesheet**

Check if `client/src/index.css` (or equivalent) already has a `@keyframes shrink` and `animate-slide-up`. If not, add:

```css
@keyframes shrink {
  from { transform: scaleX(1); }
  to { transform: scaleX(0); }
}

@keyframes slide-up {
  from { opacity: 0; transform: translateY(1rem); }
  to { opacity: 1; transform: translateY(0); }
}
```

And in `tailwind.config.js` or via TailwindCSS 4 `@theme` block, register `animate-slide-up`:

```css
@theme {
  --animate-slide-up: slide-up 200ms ease-out;
}
```

Check the existing `animate-slide-down` (used by Toast) for the pattern — follow the same convention.

- [ ] **Step 5: Run tests**

Run: `npx vitest run client/tests/CompletionSnackbar.test.tsx`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add client/src/components/CompletionSnackbar.tsx client/tests/CompletionSnackbar.test.tsx client/src/index.css
git commit -m "feat(undo-complete): add CompletionSnackbar component (#55)"
```

---

### Task 4: Wire snackbar into App and register beforeunload

**Goal:** Render the `CompletionSnackbar` in App.tsx, connected to the `useTasks` hook's pending completions and undo function.

**Files:**
- Modify: `client/src/App.tsx`

**Acceptance Criteria:**
- [ ] `CompletionSnackbar` renders with `pendingCompletions` and `undoCompletion` from useTasks
- [ ] Snackbar appears below other UI elements (z-50)
- [ ] No visual regressions — existing Toast and modal unaffected

**Verify:** `npm run build` → no errors, then manual visual check

**Steps:**

- [ ] **Step 1: Import and render CompletionSnackbar in App.tsx**

Add import at the top:

```typescript
import { CompletionSnackbar } from './components/CompletionSnackbar';
```

Destructure new values from `useTasks()`:

```typescript
const {
  // ... existing ...
  pendingCompletions,
  undoCompletion,
  flushCompletions,
} = useTasks();
```

Add the snackbar just before the closing `</div>` of the root element, after `FeedbackButton` and before `{error && <Toast ...>}`:

```tsx
<CompletionSnackbar pendingCompletions={pendingCompletions} onUndo={undoCompletion} />
```

- [ ] **Step 2: Add beforeunload handler in App**

Add a `useEffect` in `App` that registers `beforeunload` to flush completions. Actually — this is already handled inside `useTasks.ts` (Task 2, step 8). No additional work needed in App.

- [ ] **Step 3: Build to verify no compile errors**

Run: `npm run build`
Expected: Builds successfully

- [ ] **Step 4: Commit**

```bash
git add client/src/App.tsx
git commit -m "feat(undo-complete): wire CompletionSnackbar into App (#55)"
```

---

### Task 5: E2E tests for undo completion

**Goal:** Add Playwright E2E tests that verify the undo flow works end-to-end.

**Files:**
- Create: `e2e/tests/undo-complete.spec.ts`

**Acceptance Criteria:**
- [ ] Test: complete task → snackbar visible → click undo → task reappears
- [ ] Test: complete task → wait for snackbar to disappear → task gone from server
- [ ] Test: complete recurring task → wait → next instance appears

**Verify:** `npx playwright test e2e/tests/undo-complete.spec.ts` → all pass

**Steps:**

- [ ] **Step 1: Write E2E tests**

Create `e2e/tests/undo-complete.spec.ts`:

```typescript
import { test, expect } from '../fixtures';

test.describe('Undo complete', () => {
  test('undo brings task back', async ({ page, apiHelper }) => {
    await apiHelper.createTask({ title: 'Undo mig' });
    await page.goto('/todo');
    await expect(page.getByText('Undo mig')).toBeVisible();

    // Swipe right to complete
    const taskCard = page.getByText('Undo mig');
    const box = await taskCard.boundingBox();
    if (!box) throw new Error('Task not found');

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();

    // Snackbar should appear
    await expect(page.getByRole('button', { name: /undo/i })).toBeVisible({ timeout: 2000 });

    // Click undo
    await page.getByRole('button', { name: /undo/i }).click();

    // Task should reappear
    await expect(page.getByText('Undo mig')).toBeVisible();
  });

  test('task completes after delay expires', async ({ page, apiHelper }) => {
    const task = await apiHelper.createTask({ title: 'Vent på mig' });
    await page.goto('/todo');
    await expect(page.getByText('Vent på mig')).toBeVisible();

    // Complete via swipe
    const taskCard = page.getByText('Vent på mig');
    const box = await taskCard.boundingBox();
    if (!box) throw new Error('Task not found');

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();

    // Wait for snackbar to disappear (5s delay + margin)
    await expect(page.getByRole('button', { name: /undo/i })).not.toBeVisible({ timeout: 7000 });

    // Verify task is gone from server
    await page.reload();
    await expect(page.getByText('Vent på mig')).not.toBeVisible();
  });
});
```

- [ ] **Step 2: Run E2E tests**

Run: `npx playwright test e2e/tests/undo-complete.spec.ts`
Expected: All pass

Note: If the swipe simulation is unreliable (as noted in existing tests), adapt to use a test helper that triggers completion differently. Check if the existing completion E2E tests have workarounds.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/undo-complete.spec.ts
git commit -m "test(undo-complete): add E2E tests for undo flow (#55)"
```

---

### Task 6: Final verification and cleanup

**Goal:** Run all tests, verify no regressions, ensure build passes.

**Files:**
- None (verification only)

**Acceptance Criteria:**
- [ ] All unit tests pass
- [ ] All E2E tests pass
- [ ] Production build succeeds
- [ ] No TypeScript errors

**Verify:**
- `npm test` → all pass
- `npm run build` → success
- `npm run test:e2e` → all pass

**Steps:**

- [ ] **Step 1: Run full unit test suite**

Run: `npm test`
Expected: All tests pass, coverage thresholds met

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 3: Run E2E suite**

Run: `npm run test:e2e`
Expected: All tests pass including new undo tests

- [ ] **Step 4: Final commit if any cleanup needed**

If any files were adjusted during verification, commit them.

```bash
git add -A
git commit -m "chore(undo-complete): final cleanup and verification (#55)"
```

**requiresUserVerification: true** — The implementing agent must verify the snackbar looks correct visually on mobile viewport before marking this task complete. Take a screenshot at 375px width and confirm: snackbar appears at bottom, text is readable, undo button is tappable.
