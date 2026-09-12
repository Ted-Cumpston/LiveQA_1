## Feature 44a: Reply soft-delete, restore, and confirmed permanent delete

**Branch:** `feature/reply-soft-delete-restore-and-confirmed-permanent-delete`
**Status:** verified

## Goal

Give an Administrator or an Event Manager with access to a specific event
the same soft-delete/restore/permanent-delete lifecycle for replies that
33b already built for questions, plus the admin-facing display of a
question's replies that does not exist anywhere in the admin surface
today.

**Resolved before writing this spec (each point below is inferred from
repository evidence, not invented from nothing; the split from Feature 44
into 44a/44b was already approved separately):**

1. **The build-plan's premise ("replies... already soft-delete via
   existing attendee/moderator actions") does not hold for replies.**
   28a's own spec explicitly scoped reply deletion out ("Editing or
   deleting a reply, by anyone - not asked for... nothing here proposes
   an equivalent for replies"), and no route anywhere writes
   `replies.deleted_at` today. Reply soft-delete is therefore net-new
   work in this feature, not a pre-existing capability being extended -
   mirroring 33b's own precedent of adding a brand-new admin soft-delete
   route for questions even though Feature 17's attendee self-delete
   already existed there.
2. **`replies` has a denormalized, `not null`, indexed `event_id` column**
   (`supabase/migrations/20260910070000_add_reply_realtime_access.sql`),
   distinct from `questions` and `attachments` (which have no such
   column). Every new route in this feature scopes directly with
   `.eq('id', replyId).eq('event_id', eventId)` on `replies` - the exact
   pattern `moderation/replies/action.post.ts` already uses - with no
   join through `questions` required.
3. **There is no admin-facing display of a question's replies anywhere
   today.** The admin Questions tab (33a/33b) shows only question
   text/revisions. This feature adds a nested "Replies" section (and a
   nested "Deleted replies" section) inside every question card - both
   the active-questions list and the deleted-questions list, since a
   reply's own lifecycle is independent of its parent question's - using
   the exact same visual/interaction pattern 33b already established one
   level up (an active list with Delete/Permanently-delete, a deleted
   list with Restore/Permanently-delete).
4. **`displayName` on a reply mirrors 28a's own existing convention
   exactly**: the attendee's `display_name` when `attendee_id` is set, or
   the literal label `"Moderator"` when it is `null` (a moderator-
   authored reply) - reusing the exact expression already used in
   `moderation/questions.get.ts`
   (`r.attendee_id ? nameById.get(r.attendee_id) ?? null : 'Moderator'`),
   not a new convention.
5. **Permanent delete needs no Storage cleanup.** Unlike a question
   (whose cascade-deleted `attachments` rows point at real Storage
   objects), `attachments.question_id` ties attachments to questions, not
   replies - a reply has no files of its own. `content_reports.reply_id`
   already cascades on delete (Feature 1's schema), so a hard `DELETE FROM
   replies WHERE id = ...` alone is sufficient, mirroring 33b's "child
   tables already cascade" reasoning with an even simpler case (no
   Storage step at all).
6. **Editing reply text is out of scope.** 33a (question edit with
   revision history) was its own separate feature from 33b (question
   restore/permanent-delete); by the same split, reply text editing would
   be a separate, unbuilt feature - this one only adds the three lifecycle
   actions plus the display needed to reach them.
7. **`admin/audit-log.vue`'s `ACTION_LABELS` map gets entries for the
   three new action names this feature introduces**
   (`reply_soft_deleted`, `reply_restored`, `reply_permanently_deleted`),
   mirroring `question_soft_deleted`/`question_restored`/
   `question_permanently_deleted`'s exact naming convention.

## In scope

- **`server/api/admin/events/[id]/questions.get.ts` (edit).** Adds
  `replies: AdminReplyRow[]` and `deletedReplies: AdminReplyRow[]` to
  each question row (both in `questions` and `deletedQuestions`) - one
  additional query for all replies across the event's questions, split by
  `deleted_at` exactly like the existing top-level `questions`/
  `deletedQuestions` split. Each `AdminReplyRow` is `{ id, text,
  approvalStatus, visibility, displayName, createdAt }`.
- **`server/api/admin/events/[id]/replies/soft-delete.post.ts` (new).**
  `verifyEventAccess`-gated. Body `{ replyId }`. Resolves the reply
  scoped to `(id, event_id)` with `deleted_at is null` - a missing,
  cross-event, or already-deleted id returns "Reply not found." On
  success, sets `deleted_at = now()` and calls
  `logAuditAction(callerId, 'reply_soft_deleted', eventId, { replyId })`.
- **`server/api/admin/events/[id]/replies/restore.post.ts` (new).** Same
  shape, mirrored: resolves the reply scoped to `(id, event_id)` with
  `deleted_at is not null` (a missing, cross-event, or
  not-currently-deleted id returns "Reply not found."), sets
  `deleted_at = null`, calls `logAuditAction(callerId, 'reply_restored',
  eventId, { replyId })`.
- **`server/api/admin/events/[id]/replies/permanent-delete.post.ts`
  (new).** `verifyEventAccess`-gated. Body `{ replyId }`. Resolves the
  reply scoped to `(id, event_id)` regardless of its current `deleted_at`
  state (per the resolved note above, matching 33b's precedent that
  permanent delete does not require a prior soft delete) - a missing or
  cross-event id returns "Reply not found." Hard-deletes the reply row
  (cascading to `content_reports` automatically), then calls
  `logAuditAction(callerId, 'reply_permanently_deleted', eventId,
  { replyId })`.
- **`app/pages/admin/events/[id].vue` (edit).** Each question card (in
  both the active and deleted-questions lists) gains a nested "Replies"
  section listing `question.replies`, each with "Delete" and "Permanently
  delete" buttons, and a nested "Deleted replies" section listing
  `question.deletedReplies`, each with "Restore" and "Permanently delete"
  buttons - reusing the existing `questionsError` alert for any reply-
  action failure and refetching the whole Questions tab
  (`fetchQuestions()`) after every successful reply action, exactly
  mirroring `performQuestionAction`'s existing shape. Each nested section
  shows a "No replies yet."/"No deleted replies." message when empty,
  mirroring the existing top-level "No questions yet."/"No deleted
  questions." paragraphs exactly.
- **`app/pages/admin/audit-log.vue` (edit).** Add the three new action
  labels to `ACTION_LABELS`.

## Out of scope

- **Editing a reply's text** - per resolved note 6, a separate,
  unbuilt feature (33a's own question-edit precedent was itself a
  separate feature from question restore/permanent-delete).
- **Attachment restore/permanent-delete, or any admin-facing attachment
  display** - Feature 44b, a separate spec.
- **A "trash retention window" or automatic purge of soft-deleted
  replies** - matching 33b's identical decision for questions; a
  soft-deleted reply stays soft-deleted indefinitely until restored or
  permanently deleted.
- **A custom confirmation dialog/modal component** - `window.confirm`
  before permanent delete, matching 33b's exact mechanism; no new UI
  component infrastructure.
- **Requiring soft delete before permanent delete, or any other required
  sequencing between the three actions** - each is independently
  reachable, matching 33b's identical decision for questions.
- **Any change to the existing moderator reply actions**
  (`approve`/`reject`/`hide`/`publish` in
  `moderation/replies/action.post.ts`) - a distinct, already-existing
  set of lifecycle fields (`approval_status`/`visibility`), unrelated to
  this feature's `deleted_at`-based actions.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **List route embeds replies per question** -
      `server/api/admin/events/[id]/questions.get.ts` per the contract
      above.
      **Done when:** code builds; every question row in both `questions`
      and `deletedQuestions` includes `replies` (non-deleted) and
      `deletedReplies` (deleted) arrays with the specified shape, and
      `displayName` resolves to `"Moderator"` for a `null` `attendee_id`.
- [x] 2. **Soft-delete and restore routes** -
      `replies/soft-delete.post.ts` and `replies/restore.post.ts` per the
      contract above.
      **Done when:** code builds; soft-delete on an already-deleted (or
      missing/cross-event) reply returns "Reply not found." and changes
      nothing; restore on a not-currently-deleted (or missing/cross-event)
      reply returns the same; a valid call in either direction updates
      only `deleted_at` and calls `logAuditAction` with the corresponding
      action name.
- [x] 3. **Permanent-delete route** -
      `replies/permanent-delete.post.ts` per the contract above.
      **Done when:** code builds; a missing/cross-event reply id returns
      "Reply not found."; a valid call removes the reply row (confirmed
      by code review that the `content_reports` cascade handles its
      dependents, since exercising a real cascade requires a live
      database outside this skill), and calls `logAuditAction` with
      `'reply_permanently_deleted'`.
- [x] 4. **Questions tab: nested reply display, restore, and
      permanent-delete UI** - the additions to `/admin/events/[id].vue`
      per the contract above.
      **Done when:** code builds; each question card shows its replies
      and deleted replies, with an empty-state message when either list
      is empty; Delete moves a reply into the deleted section on refetch;
      Restore moves it back; Permanently delete only proceeds after
      `window.confirm` and then removes the reply from both sections on
      refetch; the audit-log page shows human-readable labels for all
      three new actions.

## Files / areas

- `server/api/admin/events/[id]/questions.get.ts` (edit)
- `server/api/admin/events/[id]/replies/soft-delete.post.ts` (new)
- `server/api/admin/events/[id]/replies/restore.post.ts` (new)
- `server/api/admin/events/[id]/replies/permanent-delete.post.ts` (new)
- `app/pages/admin/events/[id].vue` (edit)
- `app/pages/admin/audit-log.vue` (edit)

## Data / contracts

- **No new migration, no new column, no new RLS policy** - this feature
  only uses `replies.deleted_at` and `replies.event_id` (both already
  present) and the existing `content_reports.reply_id` cascade rule.
- **Soft delete and restore are exact mirror images**, each requiring the
  opposite current `deleted_at` state to succeed - never a blind
  unconditional write.
- **Permanent delete is a real, irreversible `DELETE`, not another
  `deleted_at` write** - once it succeeds, the row and any cascaded
  `content_reports` rows are gone; there is no server-side undo.
- **Authorization:** `verifyEventAccess(event, eventId)` on all three new
  routes, identical to every other admin/Event-Manager-scoped route in
  this project (including 33b's question routes).
- **Audit log integration:** `'reply_soft_deleted'`, `'reply_restored'`,
  and `'reply_permanently_deleted'`, each with `{ replyId }` as `details`
  - consistent with the question actions' existing shape.
- **Response envelope:** `{ success, data, error }` throughout; all three
  new action routes return `{ replyId }` on success.

## Testing

No test runner configured; `npm run build` is the automated check for all
four steps. **Not yet exercised live:** a real soft-delete/restore round
trip, a real permanent delete actually cascading through `content_reports`,
and the audit log actually recording each new entry - all require a
running server and a real Supabase project, the same caveat recorded for
every prior feature that could not start a server from this skill.

## Notes for the AI

- Do not join through `questions` to scope a reply by event - `replies`
  already has its own `event_id` column, per resolved note 2.
- Do not add Storage cleanup to the permanent-delete route - replies have
  no attachments of their own, per resolved note 5.
- Do not add an edit control for reply text - out of scope, per resolved
  note 6.
- Do not require a soft delete before permitting a permanent delete.
- Do not build a custom confirmation modal - `window.confirm` is this
  feature's entire confirmation mechanism, matching 33b.
- Do not touch `moderation/replies/action.post.ts` or its
  `approval_status`/`visibility` fields - unrelated lifecycle, per the
  resolved out-of-scope note.
- Do not extend restore/permanent-delete to attachments - Feature 44b's
  job.
- Reuse `verifyEventAccess` and `logAuditAction` exactly as they already
  exist; do not re-implement authorization or audit logging inline.
- Reuse the existing `questionsError` ref for reply-action failures;
  do not add a new error-display element for replies.
