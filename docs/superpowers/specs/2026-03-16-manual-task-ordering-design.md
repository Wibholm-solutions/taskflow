# Manual Task Ordering Design

## Summary

Add persistent manual ordering for top-level tasks in the `Aktive` list. Users can drag tasks to reorder them within the same priority and urgency bucket. The existing server sort remains the primary structure: urgency first, then priority, then manual order. Within the urgent section, manual order replaces the current per-date ordering. `Kommende` tasks remain auto-sorted and are not draggable.

## Goals

- Let users manually reorder active tasks by drag-and-drop
- Preserve the current urgency and priority semantics
- Keep ordering stable across refreshes and devices
- Avoid conflicts with existing swipe gestures on mobile

## Non-Goals

- Reordering upcoming tasks
- Dragging across priority groups
- Dragging across urgency groups
- Reordering subtasks
- Replacing due-date or priority sorting with a global custom order

## Recommended Approach

Store a persistent `sortOrder` field on parent tasks and treat it as the final sort key within a sortable bucket.

Rationale:

- Fits the current architecture because task list ordering is already centralized in `TaskService`
- Keeps refresh behavior consistent because the server remains the source of truth
- Avoids the extra complexity of a separate ordering table

## Sorting Model

The active task list keeps the current top-level grouping:

1. Urgency bucket
2. Priority bucket
3. Manual order

Urgency buckets for active tasks:

- Overdue or due today
- Non-urgent active tasks

Priority buckets remain:

- `high`
- `default`
- `low`

Manual order only applies within tasks that share both urgency and priority. Users cannot use drag-and-drop to move a task outside its current bucket.

Within the urgent section, manual order explicitly replaces the current per-date ordering. An overdue urgent task may therefore appear below another urgent task of the same priority if the user places it there.

Each task stores only one persistent `sortOrder`. If a task later moves to a different bucket because its priority, deadline, or `notBefore` changes, it keeps the same field but is reassigned to the end of its new bucket when that mutation is saved. The system does not attempt to remember separate historical orders per bucket.

## Data Model

Add `sort_order` to the `tasks` table.

Field requirements:

- Numeric
- Non-null
- Present only on parent tasks because subtasks already live in their own table and are out of scope

Behavior:

- New tasks receive a `sort_order` that places them at the end of their current sortable bucket
- Existing tasks should receive stable values during migration so current list order is preserved initially
- Existing tasks that change priority, deadline, or `notBefore` and therefore move between active buckets are reassigned to the end of the destination bucket
- Recurring next instances are created at the end of their destination bucket

## API and Service Design

Keep ordering logic in the server so the client never becomes the source of truth for task rank.

### List tasks

`GET /tasks` continues returning `active` and `upcoming`.

`TaskService.listTasks()` should:

- Keep `upcoming` sorting unchanged
- Keep active grouping by urgency and priority
- Use `sortOrder` as the final tiebreaker within each active bucket

### Reorder tasks

Add a dedicated reorder endpoint rather than overloading generic task updates.

Recommended shape:

- `POST /tasks/reorder`

Payload:

- Ordered task ids for one bucket

Behavior:

- Validate that every task exists
- Validate that every task is incomplete
- Validate that every task belongs in the active list
- Derive bucket membership on the server from each task's current priority, deadline, `notBefore`, and completion state
- Validate that all ids belong to the same priority and urgency bucket
- Reject duplicates or missing ids for the addressed bucket
- Rewrite `sortOrder` for the full bucket in one transaction
- If the current server-derived bucket membership differs from the client’s visible state because of concurrent edits or date rollover, reject the request and require the client to refresh

This keeps drag persistence explicit and prevents accidental interaction with normal task editing.

## Client Design

### Task list behavior

Only tasks in `Aktive` are draggable.

Users may reorder:

- within `high` overdue/today
- within `default` overdue/today
- within `low` overdue/today
- within `high` non-urgent active
- within `default` non-urgent active
- within `low` non-urgent active

Users may not drag:

- into `Kommende`
- across priority groups
- across urgency groups

Invalid drops should snap back to the last valid order.

### Desktop interaction

- A visible drag handle is rendered on each draggable task card
- Desktop drag starts from the handle, not from the full card body
- The dragged card shows a grabbed state
- The list shows a placeholder or insertion gap
- Clicking elsewhere on the card still opens the task modal

### Touch interaction

- Long-press on the drag handle enters drag mode
- Swipe complete/delete is suppressed only while drag mode is active
- Releasing or cancelling drag restores normal swipe behavior
- Touch interaction outside the handle keeps the current card tap and swipe behavior

### State handling

`useTasks` should:

- apply optimistic local reorder inside the affected bucket
- persist via the reorder endpoint
- roll back to the last confirmed state if persistence fails
- surface failure through the existing error mechanism

## Error Handling

- Server rejects malformed or cross-bucket reorder payloads
- Server rejects completed or upcoming tasks in reorder requests
- Server rejects stale reorder requests whose bucket membership no longer matches current task state
- Client rolls back optimistic movement on request failure
- Invalid client drops do not trigger persistence
- Gesture cancellation should leave the visible order unchanged

## Testing Strategy

### Server tests

Add coverage for:

- preserving current ordering during migration/backfill
- sorting active tasks by urgency, then priority, then `sortOrder`, including urgent tasks no longer sorted by exact date once manual ordering is present
- leaving upcoming sorting unchanged
- successful reorder persistence for a single bucket
- rejecting reorder payloads with missing ids, duplicate ids, cross-bucket ids, upcoming ids, or completed ids
- rejecting stale reorder payloads after concurrent task changes or date-bucket changes
- atomic updates when rewriting a bucket order
- route-level validation and HTTP behavior for `POST /tasks/reorder`

### Client tests

Add coverage for:

- rendering draggable behavior only for active tasks
- optimistic reorder within a valid bucket
- snap-back or blocked behavior for invalid drops
- rollback when reorder persistence fails
- drag handle interaction on desktop
- long-press drag on the handle for touch
- no regression to swipe complete/delete when not dragging
- card click still opens edit when the drag handle is not used

### End-to-end

Add one flow covering:

- create several active tasks in the same priority bucket
- reorder them by drag-and-drop
- refresh and verify order persists
- verify tasks in another priority bucket are unaffected
- verify upcoming tasks remain non-draggable

## Open Decisions Resolved

- Manual ordering is limited to the `Aktive` list
- Drag-and-drop is limited to tasks in the same priority bucket
- Urgency still takes precedence over manual order
- Touch uses long-press before dragging
- Saved order persists until the user changes it
