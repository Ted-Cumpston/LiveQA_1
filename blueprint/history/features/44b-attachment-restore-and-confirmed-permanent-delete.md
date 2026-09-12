## Feature 44b: Attachment restore and confirmed permanent delete

**Branch:** `feature/attachment-restore-and-confirmed-permanent-delete`
**Status:** verified

## Goal

Give an Administrator or an Event Manager with access to a specific event
the same soft-delete/restore/permanent-delete lifecycle for attachments
that 44a just built for replies (and 33b built for questions), plus the
admin-facing display of a question's attachments that does not exist
anywhere in the admin surface today.

**Resolved before writing this spec (each point below is inferred from
repository evidence, not invented from nothing; the split from Feature 44
into 44a/44b was already approved separately):**

1. **Unlike replies, attachments already soft-delete via an existing
   moderator action** (`moderation/attachments/remove.post.ts`, which sets
   `deleted_at` after resolving the attachment through a join to
   `questions` for event scoping) - matching the build-plan line's
   original premise for this content type. This feature still adds its
   own admin-facing soft-delete route, mirroring 44a's exact
   Delete/Restore/Permanently-delete three-action model for parity across
   all three content types (question/reply/attachment) - an Administrator
   or Event Manager should not need a moderator session just to remove an
   attachment from the admin surface, exactly as they don't for questions
   or replies.
2. **`attachments` has no denormalized `event_id` column** (confirmed by
   reading its migration - unlike `replies`, which 44a's spec already
   established does). Every new route in this feature scopes through the
   same join `moderation/attachments/remove.post.ts` already uses:
   `.select('id, questions!inner(event_id)').eq('id', attachmentId)
   .eq('questions.event_id', eventId)`.
3. **There is no admin-facing display of a question's attachments
   anywhere today.** The admin Questions tab (33a/33b, extended by 44a for
   replies) shows question text/revisions and now replies, but never
   attachments. This feature adds a nested "Attachments" section (and a
   nested "Deleted attachments" section) inside every question card - both
   the active-questions list and the deleted-questions list, mirroring
   44a's reply-section pattern one level up, one section over.
4. **Attachment display reuses the exact `viewUrl`/`mimeType`/`sizeBytes`
   shape and rendering the moderator queue already established**
   (`moderation/questions.get.ts`'s `attachmentsByQuestionId` map: a
   signed URL via `supabase.storage.from('question-attachments')
   .createSignedUrls(paths, 3600)`, and `m/[slug].vue`'s exact markup
   `{{ attachment.mimeType }} ({{ Math.ceil(attachment.sizeBytes / 1024)
   }} KB)` plus a `View` link) - not a new display convention. The admin
   embed additionally needs signed URLs for *deleted* attachments too
   (the moderator queue only ever shows active ones), generated the same
   way.
5. **Permanent delete order matches 33b's established precedent exactly**:
   hard-delete the database row first, then best-effort remove the
   Storage object from the `question-attachments` bucket (reusing that
   exact bucket name constant already defined in
   `questions/permanent-delete.post.ts`) - a failure to remove the
   Storage object never fails the request or rolls back the already-
   committed delete.
6. **`admin/audit-log.vue`'s `ACTION_LABELS` map gets entries for the
   three new action names this feature introduces**
   (`attachment_soft_deleted`, `attachment_restored`,
   `attachment_permanently_deleted`), mirroring 44a's reply action-naming
   convention exactly.
7. **Uploading, replacing, or editing an attachment is out of scope** -
   not named anywhere in the plans; this feature only adds the three
   lifecycle actions plus the display needed to reach them.

## In scope

- **`server/api/admin/events/[id]/questions.get.ts` (edit).** Adds
  `attachments: AdminAttachmentRow[]` and `deletedAttachments:
  AdminAttachmentRow[]` to each question row (both in `questions` and
  `deletedQuestions`) - one additional query for all attachments across
  the event's questions (both deleted and non-deleted), split by
  `deleted_at` exactly like the existing `replies`/`deletedReplies` split
  44a added, plus signed URLs generated for every attachment regardless of
  its `deleted_at` state. Each `AdminAttachmentRow` is `{ id, mimeType,
  sizeBytes, viewUrl, createdAt }`.
- **`server/api/admin/events/[id]/attachments/soft-delete.post.ts`
  (new).** `verifyEventAccess`-gated. Body `{ attachmentId }`. Resolves
  the attachment scoped to `(id, questions.event_id)` via the join with
  `deleted_at is null` - a missing, cross-event, or already-deleted id
  returns "Attachment not found." On success, sets `deleted_at = now()`
  and calls `logAuditAction(callerId, 'attachment_soft_deleted', eventId,
  { attachmentId })`.
- **`server/api/admin/events/[id]/attachments/restore.post.ts` (new).**
  Same shape, mirrored: resolves the attachment scoped to `(id,
  questions.event_id)` with `deleted_at is not null` (a missing,
  cross-event, or not-currently-deleted id returns "Attachment not
  found."), sets `deleted_at = null`, calls `logAuditAction(callerId,
  'attachment_restored', eventId, { attachmentId })`.
- **`server/api/admin/events/[id]/attachments/permanent-delete.post.ts`
  (new).** `verifyEventAccess`-gated. Body `{ attachmentId }`. Resolves
  the attachment scoped to `(id, questions.event_id)` regardless of its
  current `deleted_at` state (matching 33b/44a's precedent that permanent
  delete does not require a prior soft delete) - a missing or cross-event
  id returns "Attachment not found." Reads its `storage_path`,
  hard-deletes the row, then best-effort removes that one Storage object
  from `question-attachments`, then calls `logAuditAction(callerId,
  'attachment_permanently_deleted', eventId, { attachmentId })`.
- **`app/pages/admin/events/[id].vue` (edit).** Each question card (in
  both the active and deleted-questions lists) gains a nested
  "Attachments" section listing `question.attachments`, each showing
  `mimeType`/`sizeBytes`/a `View` link (reusing the moderator queue's
  exact markup) plus "Delete" and "Permanently delete" buttons, and a
  nested "Deleted attachments" section listing
  `question.deletedAttachments`, each with "Restore" and "Permanently
  delete" buttons - reusing the existing `questionsError` alert for any
  attachment-action failure and refetching the whole Questions tab
  (`fetchQuestions()`) after every successful attachment action, exactly
  mirroring 44a's `performReplyAction` shape. Each nested section shows a
  "No attachments yet."/"No deleted attachments." message when empty.
- **`app/pages/admin/audit-log.vue` (edit).** Add the three new action
  labels to `ACTION_LABELS`.

## Out of scope

- **Uploading, replacing, or editing an attachment** - per resolved note
  7, not named anywhere in the plans.
- **Any change to the existing moderator attachment action**
  (`moderation/attachments/remove.post.ts`) - it keeps working exactly as
  it does today; this feature adds a parallel admin-facing path, not a
  replacement.
- **A "trash retention window" or automatic purge of soft-deleted
  attachments** - matching 33b/44a's identical decision; a soft-deleted
  attachment stays soft-deleted indefinitely until restored or
  permanently deleted.
- **A custom confirmation dialog/modal component** - `window.confirm`
  before permanent delete, matching 33b/44a's exact mechanism; no new UI
  component infrastructure.
- **Requiring soft delete before permanent delete, or any other required
  sequencing between the three actions** - each is independently
  reachable, matching 33b/44a's identical decision.
- **Reply restore/permanent-delete or any admin-facing reply display** -
  Feature 44a, already done.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **List route embeds attachments per question** -
      `server/api/admin/events/[id]/questions.get.ts` per the contract
      above.
      **Done when:** code builds; every question row in both `questions`
      and `deletedQuestions` includes `attachments` (non-deleted) and
      `deletedAttachments` (deleted) arrays with the specified shape,
      including a signed `viewUrl` for each.
- [x] 2. **Soft-delete and restore routes** -
      `attachments/soft-delete.post.ts` and `attachments/restore.post.ts`
      per the contract above.
      **Done when:** code builds; soft-delete on an already-deleted (or
      missing/cross-event) attachment returns "Attachment not found." and
      changes nothing; restore on a not-currently-deleted (or
      missing/cross-event) attachment returns the same; a valid call in
      either direction updates only `deleted_at` and calls
      `logAuditAction` with the corresponding action name.
- [x] 3. **Permanent-delete route** -
      `attachments/permanent-delete.post.ts` per the contract above.
      **Done when:** code builds; a missing/cross-event attachment id
      returns "Attachment not found."; a valid call removes the
      attachment row, best-effort removes its Storage object (confirmed
      by code review, since exercising real Storage removal requires a
      live Supabase project outside this skill), and calls
      `logAuditAction` with `'attachment_permanently_deleted'`.
- [x] 4. **Questions tab: nested attachment display, restore, and
      permanent-delete UI** - the additions to `/admin/events/[id].vue`
      per the contract above.
      **Done when:** code builds; each question card shows its
      attachments and deleted attachments (with mime type, size, and a
      View link), with an empty-state message when either list is empty;
      Delete moves an attachment into the deleted section on refetch;
      Restore moves it back; Permanently delete only proceeds after
      `window.confirm` and then removes the attachment from both sections
      on refetch; the audit-log page shows human-readable labels for all
      three new actions.

## Files / areas

- `server/api/admin/events/[id]/questions.get.ts` (edit)
- `server/api/admin/events/[id]/attachments/soft-delete.post.ts` (new)
- `server/api/admin/events/[id]/attachments/restore.post.ts` (new)
- `server/api/admin/events/[id]/attachments/permanent-delete.post.ts` (new)
- `app/pages/admin/events/[id].vue` (edit)
- `app/pages/admin/audit-log.vue` (edit)

## Data / contracts

- **No new migration, no new column, no new RLS policy** - this feature
  only uses `attachments.deleted_at` and `attachments.storage_path`
  (both already present) and the existing `question-attachments` Storage
  bucket.
- **Soft delete and restore are exact mirror images**, each requiring the
  opposite current `deleted_at` state to succeed - never a blind
  unconditional write.
- **Permanent delete is a real, irreversible `DELETE`, not another
  `deleted_at` write** - once it succeeds, the row is gone and its
  Storage object is best-effort removed; there is no server-side undo.
- **Authorization:** `verifyEventAccess(event, eventId)` on all three new
  routes, identical to every other admin/Event-Manager-scoped route in
  this project (including 33b's and 44a's routes).
- **Audit log integration:** `'attachment_soft_deleted'`,
  `'attachment_restored'`, and `'attachment_permanently_deleted'`, each
  with `{ attachmentId }` as `details` - consistent with the question and
  reply actions' existing shape.
- **Response envelope:** `{ success, data, error }` throughout; all three
  new action routes return `{ attachmentId }` on success.

## Testing

No test runner configured; `npm run build` is the automated check for all
four steps. **Not yet exercised live:** a real soft-delete/restore round
trip, a real permanent delete actually removing the Storage object, and
the audit log actually recording each new entry - all require a running
server and a real Supabase project, the same caveat recorded for every
prior feature that could not start a server from this skill.

## Notes for the AI

- Join through `questions` to scope an attachment by event
  (`questions!inner(event_id)`) - `attachments` has no `event_id` column
  of its own, per resolved note 2.
- Reuse the exact `question-attachments` bucket name and signed-URL
  pattern (`createSignedUrls(paths, 3600)`) already used elsewhere - do
  not invent a new bucket, TTL, or public-URL approach.
- Delete the database row before removing the Storage object on permanent
  delete, and treat the Storage removal as best-effort - per resolved
  note 5, matching 33b exactly.
- Do not touch `moderation/attachments/remove.post.ts` - it stays exactly
  as it is; this feature adds a parallel admin path, not a replacement.
- Do not build a custom confirmation modal - `window.confirm` is this
  feature's entire confirmation mechanism, matching 33b/44a.
- Do not require a soft delete before permitting a permanent delete.
- Do not add upload/replace/edit functionality for attachments - out of
  scope, per resolved note 7.
- Reuse `verifyEventAccess` and `logAuditAction` exactly as they already
  exist; do not re-implement authorization or audit logging inline.
- Reuse the existing `questionsError` ref for attachment-action failures;
  do not add a new error-display element for attachments.
