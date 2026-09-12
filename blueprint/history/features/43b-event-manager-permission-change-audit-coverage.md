## Feature 43b: Event Manager permission-change audit coverage

**Branch:** `feature/event-manager-permission-change-audit-coverage`
**Status:** verified

## Goal

Convert `admin/event-managers.vue`'s four remaining direct-client-Supabase
mutations (scope change, revoke, restore, add assignment, remove
assignment - five actions across four functions) to service-role server
routes that write to the audit log, completing project-plan.md's own
"major actions" list ("... Event Manager permission changes") and closing
out Feature 43's split from Feature 32.

**Resolved before writing this spec (each point below is inferred from
repository evidence, not invented from nothing):**

1. **The full source file was read** (`app/pages/admin/event-managers.vue`,
   218 lines) to get the exact current mutation logic before converting it
   - not a reinterpretation of what these mutations "should" do.
2. **All four target functions share one authorization boundary:
   `verifyAdministrator`.** `event-managers.vue` is gated
   `definePageMeta({ middleware: ['admin', 'administrator-only'] })` -
   unlike Feature 43a's `events/[id].vue`, there is no Event Manager path
   into this page at all. RLS confirms the same boundary independently:
   `profiles_update` and `event_manager_assignments_insert`/`_update`
   (`supabase/migrations/20260909005610_rls_policies.sql`) all read `using
   (is_administrator(auth.uid()))` with no Event Manager branch. So, unlike
   43a, every new route in this feature uses `verifyAdministrator` - there
   is no `verifyEventAccess` case here.
3. **Revoke and restore get distinct audit actions**
   (`event_manager_revoked` / `event_manager_restored`), not one
   parameterized action - matching this codebase's own established
   opposite-state convention (`question_soft_deleted`/`question_restored`,
   `branding_logo_uploaded`/`branding_logo_removed`). The client's single
   `toggleRevoked()` function will call whichever of the two routes matches
   the row's current `deleted_at` state, exactly as it already picks the
   toggle direction today.
4. **Assignment add/remove are event-scoped audit entries; scope
   change and revoke/restore are not.** Add/remove act on one specific
   event (`event_manager_assignments.event_id`), so their audit entries
   log against that event, matching `event_duplicated`'s existing pattern
   of logging against the concrete resource affected. Scope change and
   revoke/restore act on the Event Manager's profile, with no single event
   involved, so they log with `eventId: null`, matching
   `event_manager_created`'s existing precedent.
5. **No new validation is added beyond what today's direct-client calls
   already assume.** Today, `setScope`/`toggleRevoked` update `profiles`
   by id with no check that the target row's `role` is actually
   `event_manager` (the client only ever passes ids sourced from its own
   `role = 'event_manager'` query, but neither the client code nor RLS
   enforces this server-side). The new routes preserve this exactly - no
   added `role` check - since administrators are this system's trusted
   actor for this whole page, and adding a new server-side restriction here
   would be a behavior change, not a transport change.
6. **New validation is added only where it is required for the transport
   change to be safe, not to change product behavior:** the assignment
   routes fetch the target row before acting (`event_manager_assignments`
   for remove, to recover its `event_id` for the audit log entry and to
   return 404 instead of silently no-op'ing on an already-removed or
   nonexistent assignment - mirroring `questions/soft-delete.post.ts`'s
   existing fetch-then-act shape exactly), and the add-assignment route
   surfaces the existing `event_manager_assignments_unique` partial-unique-
   index violation (`23505`) as a friendly message instead of a raw
   Postgres error, mirroring `details.post.ts`'s existing
   duplicate-slug-or-join-code handling. Neither of these existed as
   client-visible behavior before (the client silently no-ops or lets
   Postgres's raw error surface today), but both are direct, necessary
   consequences of moving the mutation behind an HTTP boundary - not scope
   creep.
7. **Client-side error surfacing is added, because there currently is
   none to preserve.** All four current functions
   (`setScope`/`toggleRevoked`/`addAssignment`/`removeAssignment`) call
   Supabase directly with no error check at all today - a failed RLS
   update fails silently and the page just reloads unchanged. Converting to
   a `$fetch` call requires handling the network/auth failure path (an
   uncaught rejection isn't acceptable), so each converted function will
   surface a failure via the page's existing shared `errorMessage` ref
   (already used for `loadData()`'s own failure today) rather than
   inventing new per-row error UI. This is the smallest change that keeps
   the transport swap correct; it is not a new feature.
8. **`admin/audit-log.vue`'s `ACTION_LABELS` map gets entries for the five
   new action names this feature introduces**
   (`event_manager_scope_changed`, `event_manager_revoked`,
   `event_manager_restored`, `event_manager_assignment_added`,
   `event_manager_assignment_removed`) - not a backfill of any other gap.

## In scope

- **`server/api/admin/event-managers/[id]/scope.post.ts` (new).**
  `verifyAdministrator`-gated. Body: `{ scope: 'global' | 'restricted' }`.
  Validates `scope` is one of the two values. Updates `profiles.em_scope`
  where `id` = the route's `[id]`. Logs `event_manager_scope_changed` with
  `eventId: null`, `details: { eventManagerId, scope }`.
- **`server/api/admin/event-managers/[id]/revoke.post.ts` (new).**
  `verifyAdministrator`-gated. Sets `profiles.deleted_at` to the current
  timestamp for `[id]`. Logs `event_manager_revoked` with `eventId: null`,
  `details: { eventManagerId }`.
- **`server/api/admin/event-managers/[id]/restore.post.ts` (new).**
  `verifyAdministrator`-gated. Sets `profiles.deleted_at` to `null` for
  `[id]`. Logs `event_manager_restored` with `eventId: null`,
  `details: { eventManagerId }`.
- **`server/api/admin/event-managers/[id]/assignments.post.ts` (new).**
  `verifyAdministrator`-gated. Body: `{ eventId: string }`. Inserts an
  `event_manager_assignments` row (`event_manager_id: [id]`,
  `event_id: body.eventId`, `granted_by`: the calling administrator).
  Maps a `23505` (the existing active-assignment-per-event-manager unique
  index) to a friendly "This Event Manager is already assigned to that
  event." error. Logs `event_manager_assignment_added` with
  `eventId: body.eventId`, `details: { eventManagerId: id }`.
- **`server/api/admin/event-managers/assignments/[assignmentId]/remove.post.ts`
  (new).** `verifyAdministrator`-gated. Fetches the assignment
  (`id`, `event_manager_id`, `event_id`) where `deleted_at is null`;
  404s with "Assignment not found." if missing. Sets its `deleted_at` to
  the current timestamp. Logs `event_manager_assignment_removed` with the
  fetched `eventId`, `details: { eventManagerId, assignmentId }`.
- **`app/pages/admin/event-managers.vue` (edit).** `setScope()`,
  `toggleRevoked()`, `addAssignment()`, and `removeAssignment()` call
  their new routes via `$fetch` with the Bearer session token, replacing
  their direct `supabase.from(...)` calls. Each surfaces a failure through
  the page's existing `errorMessage` ref (see resolved note 7) and calls
  `loadData()` only on success.
- **`app/pages/admin/audit-log.vue` (edit).** Add the five new action
  labels to `ACTION_LABELS`.

## Out of scope

- **`createEventManager()`** - already a server route
  (`server/api/admin/event-managers.post.ts`) with audit logging since
  Feature 32; untouched.
- **Adding a `role = 'event_manager'` guard to the scope/revoke/restore
  routes** - not present today either client-side or in RLS; per resolved
  note 5, preserving current behavior exactly, not a hardening pass.
- **Any change to what these mutations actually do** - beyond the two
  narrow, necessary additions in resolved note 6, this is a transport and
  audit-logging change (client Supabase call -> server route ->
  service-role write, plus an audit entry), not a behavior change.
- **The event-admin mutations converted in Feature 43a** - already done.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Scope and revoke/restore routes** -
      `server/api/admin/event-managers/[id]/scope.post.ts`,
      `server/api/admin/event-managers/[id]/revoke.post.ts`,
      `server/api/admin/event-managers/[id]/restore.post.ts`; wire
      `setScope()` and `toggleRevoked()` in
      `app/pages/admin/event-managers.vue`.
      **Done when:** code builds; all three routes are
      `verifyAdministrator`-gated; scope validation rejects any value other
      than `global`/`restricted`; all three write their audit action
      (confirmed by code review, since exercising a real Supabase project
      is outside this skill); `toggleRevoked()` calls `revoke` when
      `deleted_at` is currently null and `restore` otherwise; both
      converted functions surface a failure via `errorMessage` and reload
      only on success.
- [x] 2. **Assignment routes** -
      `server/api/admin/event-managers/[id]/assignments.post.ts`,
      `server/api/admin/event-managers/assignments/[assignmentId]/remove.post.ts`;
      wire `addAssignment()` and `removeAssignment()` in
      `app/pages/admin/event-managers.vue`.
      **Done when:** code builds; both routes are
      `verifyAdministrator`-gated; the add route maps a `23505` to the
      friendly duplicate-assignment message; the remove route 404s on a
      missing or already-removed assignment id; both write their audit
      action with the correct event-scoped `eventId`; both converted
      functions surface a failure via `errorMessage` and reload only on
      success.
- [x] 3. **Audit log labels** - add the five new action labels to
      `app/pages/admin/audit-log.vue`'s `ACTION_LABELS`.
      **Done when:** code builds; all five new action names have a
      human-readable label.

## Files / areas

- `server/api/admin/event-managers/[id]/scope.post.ts` (new)
- `server/api/admin/event-managers/[id]/revoke.post.ts` (new)
- `server/api/admin/event-managers/[id]/restore.post.ts` (new)
- `server/api/admin/event-managers/[id]/assignments.post.ts` (new)
- `server/api/admin/event-managers/assignments/[assignmentId]/remove.post.ts` (new)
- `app/pages/admin/event-managers.vue` (edit)
- `app/pages/admin/audit-log.vue` (edit)

## Data / contracts

- **Response envelope:** `{ success, data, error }` throughout, matching
  every other server route in this project. All five new routes return
  `data: null` on success; the client always reloads via `loadData()`
  rather than reading response data.
- **Authorization:** `verifyAdministrator` for all five routes - per
  resolved note 2, this page has no Event Manager-reachable path at all.
- **New audit actions:** `event_manager_scope_changed`,
  `event_manager_revoked`, `event_manager_restored`,
  `event_manager_assignment_added`, `event_manager_assignment_removed` -
  each logged via the existing `logAuditAction` helper.

## Testing

No test runner configured; `npm run build` is the automated check for all
three steps. **Not yet exercised live:** the full scope-change/revoke/
restore/assign/unassign flow against a real Supabase project, and the
audit log actually recording each new entry - both require a running
server and a real Supabase project, the same caveat recorded for every
prior feature that could not start a server from this skill.

## Notes for the AI

- Use `verifyAdministrator` for all five routes - there is no
  `verifyEventAccess` case in this feature, per resolved note 2.
- Give revoke and restore distinct audit actions, not one parameterized
  action - per resolved note 3.
- Log scope-change/revoke/restore with `eventId: null`; log
  assignment-added/-removed with the specific event's id - per resolved
  note 4.
- Do not add a `role = 'event_manager'` guard to scope/revoke/restore -
  per resolved note 5, that would be a behavior change, not a transport
  change.
- Do add the 404-on-missing-assignment check and the friendly
  duplicate-assignment message - per resolved note 6, both are required
  for the transport change to behave safely, not scope creep.
- Surface failures via the page's existing `errorMessage` ref and reload
  only on success - per resolved note 7. Do not add new per-row error UI.
- Keep each new route's `logAuditAction` `details` payload minimal,
  matching this project's existing style - not a full field diff.
