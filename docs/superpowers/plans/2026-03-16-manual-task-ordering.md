# Manual Task Ordering Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent drag-and-drop ordering for active parent tasks within the same urgency and priority bucket, with desktop drag handles, touch long-press on the handle, and server-enforced reorder validation.

**Architecture:** Extend the task model with a persistent `sort_order` field and keep the server as the source of truth for bucket membership, sorting, and reorder persistence. Update the client list rendering to expose a dedicated drag handle and optimistic bucket-local reorder flow while preserving existing edit, swipe-complete, and swipe-delete interactions.

**Tech Stack:** TypeScript, React 18, Hono, Drizzle ORM, SQLite (`better-sqlite3`), Vitest, Playwright

---

## File Structure

- Modify: `server/src/db/schema.ts` to add `sortOrder` to the Drizzle task schema.
- Modify: `server/src/index.ts` to upgrade existing SQLite databases at startup, normalize schema, and backfill `sort_order` deterministically.
- Modify: `server/src/types.ts` to define reorder request types if needed by routes/service.
- Modify: `server/src/services/taskService.ts` to normalize dates, assign `sortOrder`, sort with stable fallback keys, and persist bucket-local reorders.
- Modify: `server/src/routes/tasks.ts` to validate and expose `POST /tasks/reorder`.
- Modify: `server/tests/db.test.ts`, `server/tests/taskService.test.ts`, and `server/tests/api.test.ts` to add schema coverage, service-level sorting/reorder tests, and route-level validation tests.
- Modify: `client/src/types.ts` and `client/src/services/api.ts` to add reorder payload/client API types.
- Modify: `client/src/hooks/useTasks.ts` to support optimistic reorder, rollback, and refresh on stale server responses.
- Modify: `client/src/App.tsx` to pass reorder handlers from `useTasks()` into `TaskList`.
- Modify: `client/src/components/TaskList.tsx` and `client/src/components/TaskItem.tsx` to add drag handles, drag state, and bucket-aware drop rules while preserving existing click/swipe behavior.
- Modify: `client/src/index.css` if needed for drag-handle affordance and placeholder styling.
- Modify: `e2e/tests/task-sorting.spec.ts` or add a focused reorder spec to cover persistent ordering, invalid movement blocking, and handle interactions.

## Chunk 1: Server Data Model And Sorting

### Task 1: Add failing schema tests for `sort_order`

**Files:**
- Modify: `server/tests/db.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('creates tasks with sort_order available', async () => {
  const result = db.prepare("PRAGMA table_info(tasks)").all() as Array<{ name: string }>;
  expect(result.some((column) => column.name === 'sort_order')).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:server -- server/tests/db.test.ts`
Expected: FAIL because the test schema and startup schema do not include `sort_order`.

- [ ] **Step 3: Add schema support**

Implement:

```ts
sortOrder: integer('sort_order').notNull().default(0),
```

Add startup upgrade logic in `server/src/index.ts` that:

```ts
const taskColumns = db.prepare("PRAGMA table_info(tasks)").all();
if (!taskColumns.some((column: any) => column.name === 'sort_order')) {
  db.exec("ALTER TABLE tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:server -- server/tests/db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/db/schema.ts server/src/index.ts server/tests/db.test.ts
git commit -m "feat: add task sort order schema support"
```

### Task 2: Add failing tests for active sorting and deterministic fallback

**Files:**
- Modify: `server/tests/taskService.test.ts`
- Modify: `server/tests/api.test.ts` if shared setup helpers need `sort_order`

- [ ] **Step 1: Write the failing tests**

Add tests covering:

```ts
it('sorts active tasks by urgency, priority, sortOrder, createdAt, then id', async () => {
  // arrange equal-bucket tasks with tied sortOrder and distinct createdAt/id
  expect(result.active.map((task) => task.title)).toEqual([
    'Urgent rank 1',
    'Urgent rank 2',
    'Urgent fallback older',
    'Urgent fallback newer',
    'Default bucket first',
  ]);
});

it('keeps upcoming sorting independent from sortOrder', async () => {
  expect(result.upcoming.map((task) => task.title)).toEqual([
    'Sooner upcoming',
    'Later upcoming',
  ]);
});

it('normalizes deadline and notBefore values before deriving buckets', async () => {
  expect(result.active[0].deadline).toBe('2026-03-16');
  expect(result.upcoming[0].notBefore).toBe('2026-03-17');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:server -- server/tests/taskService.test.ts`
Expected: FAIL because `listTasks()` does not read `sort_order` or fallback sort keys.

- [ ] **Step 3: Implement minimal sorting changes**

Update `server/src/services/taskService.ts` to:

```ts
function normalizeDate(value?: string | null): string | null {
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 10);
}

active.sort((a, b) => {
  const bucketDiff = compareUrgencyAndPriority(a, b, today);
  if (bucketDiff !== 0) return bucketDiff;
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  if (a.createdAt !== b.createdAt) return a.createdAt.localeCompare(b.createdAt);
  return a.id.localeCompare(b.id);
});
```

Also ensure task create/update/recurrence paths persist normalized `deadline` and `notBefore`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:server -- server/tests/taskService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/taskService.ts server/tests/taskService.test.ts server/tests/api.test.ts
git commit -m "feat: sort active tasks by manual order"
```

### Task 3: Add failing tests for startup backfill and mutation-driven reassignment

**Files:**
- Modify: `server/tests/taskService.test.ts`
- Modify: `server/src/index.ts`
- Modify: `server/src/services/taskService.ts`

- [ ] **Step 1: Write the failing tests**

Cover:

- startup backfill preserves pre-feature order using `created_at`, then `id` for undefined ties
- editing `priority`, `deadline`, or `notBefore` moves a task to the end of its new active bucket
- tasks moved into `Kommende` keep a non-null `sortOrder` without affecting upcoming ordering
- time-driven bucket changes keep `sortOrder` unchanged and rely on fallback keys only
- recurring completion reuses or creates next instances with the destination-bucket `sortOrder` rule
- reorder writes are atomic, so an invalid bucket rewrite leaves existing `sortOrder` values unchanged

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:server -- server/tests/taskService.test.ts`
Expected: FAIL because backfill and bucket reassignment rules are not implemented.

- [ ] **Step 3: Implement minimal lifecycle logic**

Implement:

```ts
function nextSortOrderForBucket(/* tx, task state */): number { /* max + 1 within server-derived active bucket */ }
function shouldRebucket(existing: TaskResponse, input: UpdateTaskInput): boolean { /* priority/deadline/notBefore changed */ }
```

Use these rules:

- create: assign end-of-bucket `sortOrder` for active tasks, inert `sortOrder` for upcoming tasks
- update: when mutation changes active bucket, assign end-of-destination-bucket `sortOrder`
- recurrence: both create-next-instance and reuse-existing-instance paths must assign destination-bucket `sortOrder`
- startup backfill: compute current app order, then write increasing `sort_order` values for incomplete tasks

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:server -- server/tests/taskService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/index.ts server/src/services/taskService.ts server/tests/taskService.test.ts
git commit -m "feat: assign task order across lifecycle changes"
```

## Chunk 2: Reorder API And Validation

### Task 4: Add failing service tests for server-derived bucket validation

**Files:**
- Modify: `server/tests/taskService.test.ts`
- Modify: `server/src/services/taskService.ts`

- [ ] **Step 1: Write the failing tests**

Add tests that verify `service.reorder()`:

- rewrites `sortOrder` sequentially for the full addressed bucket
- rejects duplicate ids
- rejects missing ids for tasks in the same bucket
- rejects tasks from different priority/urgency buckets
- rejects completed or upcoming tasks
- rejects stale requests after edits/date normalization change bucket membership
- leaves persisted order unchanged when validation fails mid-request to prove atomic bucket rewrites

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:server -- server/tests/taskService.test.ts`
Expected: FAIL because `reorder()` is not implemented.

- [ ] **Step 3: Implement minimal service method**

Sketch:

```ts
async reorder(taskIds: string[]): Promise<void> {
  const rows = await this.db.select().from(tasks).where(inArray(tasks.id, taskIds));
  const bucket = deriveBucket(rows[0], today);
  validateExactBucketMembership(rows, taskIds, bucket);
  this.db.transaction((tx) => {
    taskIds.forEach((id, index) => {
      tx.update(tasks).set({ sortOrder: index, updatedAt: now }).where(eq(tasks.id, id)).run();
    });
  });
}
```

Use exact bucket membership computed on the server from normalized date fields and task state.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:server -- server/tests/taskService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/taskService.ts server/tests/taskService.test.ts
git commit -m "feat: enforce bucket-local task reordering"
```

### Task 5: Add failing route tests for `POST /tasks/reorder`

**Files:**
- Modify: `server/tests/api.test.ts`
- Modify: `server/src/types.ts`

- [ ] **Step 1: Write the failing tests**

Add tests for:

```ts
it('reorders tasks inside one active bucket', async () => {
  const res = await app.request('/tasks/reorder', {
    method: 'POST',
    body: JSON.stringify({ taskIds: [taskB.id, taskA.id] }),
  });
  expect(res.status).toBe(200);
});

it('rejects duplicate, missing, upcoming, completed, and cross-bucket ids', async () => {
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: 'invalid reorder payload' });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:server -- server/tests/api.test.ts`
Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement minimal route and validation**

Add request typing:

```ts
export interface ReorderTasksInput {
  taskIds: string[];
}
```

Add route validation in `server/src/routes/tasks.ts`:

```ts
if (!Array.isArray(body.taskIds) || body.taskIds.length === 0) {
  return c.json({ error: 'invalid reorder payload' }, 400);
}
if (!body.taskIds.every((id: unknown) => typeof id === 'string')) {
  return c.json({ error: 'invalid reorder payload' }, 400);
}
```

Delegate to `service.reorder(body.taskIds)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:server -- server/tests/api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/tasks.ts server/src/types.ts server/tests/api.test.ts
git commit -m "feat: add task reorder api"
```

## Chunk 3: Client Drag Interaction And End-To-End Coverage

### Task 6: Add failing client tests for reorder state and rollback

**Files:**
- Modify: `client/src/hooks/useTasks.ts`
- Modify: `client/src/App.tsx`
- Modify: `client/src/services/api.ts`
- Modify: `client/tests/useTasks.test.ts`

- [ ] **Step 1: Write the failing tests**

Cover:

- optimistic reorder within one bucket updates visible active order immediately
- failed reorder request restores prior order and surfaces the existing error message
- stale server rejection triggers refresh and snaps back cleanly

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:client -- client/tests/useTasks.test.ts`
Expected: FAIL because no reorder state or API exists.

- [ ] **Step 3: Implement minimal client reorder flow**

Add API client:

```ts
reorderTasks: (taskIds: string[]) =>
  request<void>('/tasks/reorder', {
    method: 'POST',
    body: JSON.stringify({ taskIds }),
  }),
```

Add `useTasks` behavior:

```ts
const reorderTasks = useCallback(async (taskIds: string[]) => {
  const prevActive = active;
  setActive(reordered);
  try {
    await api.reorderTasks(taskIds);
    await refresh();
  } catch (e) {
    setActive(prevActive);
    setError((e as Error).message);
    await refresh();
  }
}, [active, refresh]);
```

Update `client/src/App.tsx` to pass the new reorder callback into `TaskList`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:client -- client/tests/useTasks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/App.tsx client/src/hooks/useTasks.ts client/src/services/api.ts client/src/types.ts client/tests/useTasks.test.ts
git commit -m "feat: add client task reorder state"
```

### Task 7: Add failing component tests for drag handle behavior

**Files:**
- Modify: `client/src/components/TaskItem.tsx`
- Modify: `client/src/components/TaskList.tsx`
- Modify: `client/tests/TaskItem.test.tsx`
- Add: `client/tests/TaskList.test.tsx`
- Modify: `client/src/index.css` if styling helpers are needed

- [ ] **Step 1: Write the failing tests**

Cover:

- active cards render a visible drag handle; upcoming cards do not
- clicking the card body still opens edit
- pressing the drag handle does not open edit
- long-press on the handle enters drag mode on touch
- swipe handlers remain active outside drag mode
- cross-bucket drops are blocked or snap back

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:client -- client/tests/TaskItem.test.tsx client/tests/TaskList.test.tsx`
Expected: FAIL because the handle and drag interactions do not exist.

- [ ] **Step 3: Implement minimal UI behavior**

Implementation shape:

```tsx
<button
  type="button"
  data-drag-handle
  onPointerDown={startDesktopDrag}
  onTouchStart={startLongPressTimer}
  onClick={(event) => event.stopPropagation()}
>
  ::
</button>
```

Add bucket-aware drag props from `TaskList` to `TaskItem`, and ensure:

- handle events stop propagation
- card body click still calls `onTap(task)`
- invalid drops restore the previous visible order without API calls

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:client -- client/tests/TaskItem.test.tsx client/tests/TaskList.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/TaskItem.tsx client/src/components/TaskList.tsx client/src/index.css client/tests/TaskItem.test.tsx client/tests/TaskList.test.tsx
git commit -m "feat: add draggable task handle"
```

### Task 8: Add failing end-to-end reorder coverage

**Files:**
- Modify: `e2e/tests/task-sorting.spec.ts` or add `e2e/tests/task-reorder.spec.ts`
- Modify: `e2e/helpers/api.ts` if helper setup is needed

- [ ] **Step 1: Write the failing test**

Add a flow that:

- creates multiple active tasks in one priority bucket
- drags one task by its handle above another
- refreshes and verifies order persistence
- confirms another bucket is unchanged
- confirms upcoming tasks are not draggable
- confirms using the handle does not open the edit modal

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:e2e -- e2e/tests/task-sorting.spec.ts`
Expected: FAIL because reorder UI and API are not implemented.

- [ ] **Step 3: Implement minimal e2e support adjustments**

If needed, add stable selectors such as:

```tsx
data-testid={`task-${task.id}`}
data-testid={`task-drag-handle-${task.id}`}
data-bucket={bucketKey}
```

Keep selectors narrow to avoid coupling the spec to presentation text.

- [ ] **Step 4: Run targeted e2e to verify it passes**

Run: `npm run test:e2e -- e2e/tests/task-sorting.spec.ts`
Expected: PASS.

- [ ] **Step 5: Run focused verification**

Run: `npm run test:server -- server/tests/taskService.test.ts server/tests/api.test.ts`
Expected: PASS.

Run: `npm run test:client -- client/tests/useTasks.test.ts client/tests/TaskItem.test.tsx client/tests/TaskList.test.tsx`
Expected: PASS.

Run: `npm run test:e2e -- e2e/tests/task-sorting.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add e2e/tests/task-sorting.spec.ts e2e/helpers/api.ts client/src/components/TaskItem.tsx client/src/components/TaskList.tsx
git commit -m "test: cover manual task ordering"
```

## Final Verification

- [ ] Run: `npm run test:server`
Expected: PASS.

- [ ] Run: `npm run test:client`
Expected: PASS.

- [ ] Run: `npm run test:e2e -- e2e/tests/task-sorting.spec.ts e2e/tests/task-completion.spec.ts`
Expected: PASS.

- [ ] Run: `git status --short`
Expected: only intended plan/implementation changes remain.
