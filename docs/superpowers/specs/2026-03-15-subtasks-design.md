# Subtasks Design

## Summary

Add one-level subtasks to TaskFlow using a dedicated `subtasks` table. Top-level tasks remain in `tasks`. Subtasks are edited inline inside the existing task modal, never shown as standalone list items, and enforced by server-side completion rules.

## Goals

- Support one level of subtasks for a parent task
- Let users add, edit, check off, and remove subtasks inline while editing a parent task
- Prevent parent completion when unfinished subtasks exist unless the user explicitly confirms completing all remaining subtasks
- Show in the overview when a task has subtasks and the current completion progress
- Keep the model obvious for future agent sessions by separating parent tasks and subtasks structurally

## Non-Goals

- Nested subtasks
- Independent subtask scheduling, recurrence, or priority
- Showing subtasks as top-level cards in active or upcoming lists
- Auto-completing a parent task when all subtasks are checked

## Recommended Approach

Use a dedicated `subtasks` table rather than overloading the existing `tasks` table.

Rationale:

- The data model is explicit and easy to infer from schema and service boundaries
- Future changes can target subtask behavior without adding conditional task-role logic everywhere
- The client can reason about a task aggregate: one parent task plus a collection of subtasks

## Data Model

### Existing

- `tasks` remains the source of truth for top-level tasks

### New

Add `subtasks` with fields:

- `id`
- `task_id` - foreign key to parent task
- `title`
- `is_completed`
- `completed_at`
- `created_at`
- `updated_at`

Notes:

- A subtask belongs to exactly one parent task
- Deleting a parent task should delete its subtasks
- Ordering can initially follow `created_at`; add explicit sort order later only if needed

## API and Service Design

Keep subtask behavior centered in `TaskService` so routes stay thin.

### Aggregate shape

Extend task detail responses to include:

- Parent task fields
- `subtasks: SubtaskResponse[]`
- Progress metadata can be derived in the client or returned explicitly for list views

### Create task

Allow task creation with optional initial subtasks.

Expected behavior:

- Create parent task first
- Insert non-empty subtasks linked to the new parent
- Ignore empty placeholder rows from the client

### Get task by id

Return the parent task together with its subtasks for modal editing.

### Update task

Accept an aggregate update payload:

- Parent task field updates
- Existing subtasks to update
- New subtasks to create
- Existing subtasks to delete

Expected behavior:

- Process the parent update and subtask mutations in one transaction
- Ignore new subtasks with empty titles
- Reject updates for subtasks not belonging to the target parent task

### Complete task

Completion must be enforced on the server.

Rules:

- If no unfinished subtasks exist, complete the parent normally
- If unfinished subtasks exist and the request is not confirmed, return a response that indicates confirmation is required
- If the request is confirmed, mark all remaining subtasks complete, then complete the parent

This keeps the invariant valid even if a future client changes behavior.

### Delete task

Deleting a parent task deletes all subtasks in the same operation.

## Client Design

### Task list

Only parent tasks appear in active and upcoming lists.

Each task card can show:

- A subtask icon when subtasks exist
- Progress text such as `2/5`

Even when all subtasks are complete, the indicator remains visible until the parent task itself is completed or deleted.

### Task modal

Reuse the existing `TaskModal` as the aggregate editor.

Layout:

- Parent task title and existing fields at the top
- Inline subtask section below the parent fields
- Each subtask row includes:
  - Checkbox
  - Editable text field
  - Delete action
- A control to add a new subtask row

Interaction rules:

- Subtasks are edited inline in the same modal as the parent task
- Checking a subtask only changes that subtask, not the parent task
- Completed subtasks stay visible when reopening the parent task
- The parent task remains open until explicitly completed by the user

### Parent completion confirmation

When a user tries to complete a parent task with unfinished subtasks:

- Show a confirmation dialog with two choices:
  - Complete all subtasks and close parent
  - Cancel / leave parent open

If the user confirms, the client resubmits completion with explicit confirmation so the server can finish the aggregate safely.

## Error Handling

- Server rejects parent completion without confirmation when open subtasks remain
- Server validates that subtask mutations belong to the addressed parent task
- Empty subtask rows are ignored instead of persisted
- The UI should surface completion-confirmation responses as a user-facing prompt rather than a generic error
- If aggregate save fails, the modal remains open with current input intact

## Testing Strategy

### Server tests

Add coverage for:

- Creating a task with subtasks
- Fetching a task aggregate with subtasks
- Updating parent task and mixed subtask mutations in one request
- Blocking parent completion when unfinished subtasks exist
- Completing all remaining subtasks plus parent after confirmation
- Deleting a parent task and cascading subtask deletion

### Client tests

Add coverage for:

- Rendering existing subtasks in `TaskModal`
- Inline add, edit, check, and delete flows
- Submitting aggregate payloads correctly
- Showing the completion confirmation path
- Showing subtask icon/progress on task cards
- Ensuring subtasks do not render as standalone top-level list items

### End-to-end

Add one flow covering:

- Create parent task with subtasks
- Reopen and edit subtasks inline
- Attempt to complete the parent
- Confirm completing all remaining subtasks
- Verify the parent leaves the active list

## Implementation Notes

- Prefer transactions around aggregate create, update, complete, and delete operations
- Keep route handlers thin and push parent/subtask rules into service methods
- Keep top-level task list queries scoped to parent tasks only
- Start with one-level subtasks only; do not introduce recursive structures

## Open Decisions Resolved

- Subtasks are limited to one level
- Parent completion shows a confirmation instead of auto-finishing subtasks
- Subtasks are editable inline in the parent task modal
- Parent tasks do not auto-complete when all subtasks are complete
