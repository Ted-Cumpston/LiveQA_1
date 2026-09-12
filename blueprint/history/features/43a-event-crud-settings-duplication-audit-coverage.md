## Feature 43a: Event CRUD, settings, and duplication audit coverage

**Branch:** `feature/event-crud-settings-duplication-audit-coverage`
**Status:** verified

## Goal

Convert the five remaining direct-client-Supabase event mutations (create,
publish, save details, save settings, save branding, duplicate) to
service-role server routes that write to the audit log - completing
project-plan.md's own "major actions" list ("event CRUD, settings changes
... duplication") for the event-admin surface, continuing Feature 43's
split from Feature 32.

**Resolved before writing this spec (each point below is inferred from
repository evidence, not invented from nothing):**

1. **Both source files were read in full before scoping this spec**
   (`app/pages/admin/events/new.vue`, `app/pages/admin/events/[id].vue`) to
   get the exact current validation logic, error handling, and response
   shapes each server route must replicate byte-for-byte - not a
   reinterpretation of what these mutations "should" do.
2. **Authorization must match each action's real current boundary, not a
   uniform gate** - these two pages have different authorization scopes
   today, and converting to server routes must preserve that exactly:
   - `events/new.vue` is gated `definePageMeta({ middleware: ['admin',
     'administrator-only'] })` - only Administrators can reach
     `createEvent()`/`publish()` today. Their new routes use
     `verifyAdministrator`.
   - `events/[id].vue` is gated only `definePageMeta({ middleware: 'admin'
     })` (no `administrator-only`) - both Administrators and Event
     Managers reach `saveDetails()`/`saveSettings()`/`saveBranding()`
     today, and RLS's own `events_update`/`event_settings_update` policies
     already allow `is_administrator() OR is_event_manager_for(event_id)`.
     Their new routes use `verifyEventAccess` (event-scoped, matching
     `dashboard.get.ts`'s existing precedent) - **not**
     `verifyAdministrator`, which would silently revoke Event Managers'
     existing ability to edit their own assigned events.
   - `duplicateEvent()` is different again: its "Duplicate" button is only
     ever rendered `v-if="profile?.role === 'administrator'"`, and RLS's
     `events_insert` policy is already administrator-only
     (`with check (is_administrator(...))`) - an Event Manager's attempt
     already fails today regardless of the button's visibility. Its new
     route uses `verifyAdministrator`, matching that real existing
     restriction.
3. **`saveAsDraft()` needs no route** - it only navigates away with no
   mutation (the event was already created in the `details` step); there
   is nothing here to convert or log.
4. **Attendee-type add/remove (in both files) stay direct-client, RLS-gated
   calls** - project-plan.md's "major actions" list names "event CRUD,
   settings changes, moderator password rotation, admin question edits,
   permanent deletion, duplication, report generation, retention purge,
   Event Manager permission changes." Attendee-type CRUD isn't on that
   list, matching this project's own established precedent of only
   converting and logging what's explicitly named (identical reasoning
   already used for blocked-terms and templates, which also stay
   client-side).
5. **Publishing (`status` -> `'live'`) gets its own audit action,
   `event_published`, separate from `event_details_updated`/
   `event_settings_updated`** - going live is one of the most operationally
   significant moments in this whole system (it's the exact instant every
   attendee/moderator entry point starts resolving), not merely one more
   field update.
6. **Each route's audit `details` payload stays minimal**, matching this
   project's own established style (e.g. `moderator_password_rotated`,
   `branding_logo_uploaded` log `{}`/one field, never a full diff) - the
   audit log records who did what to which event and when, not a
   field-by-field change dump. `event_duplicated` mirrors
   `event_restored_from_backup`'s exact existing pattern: the audit
   entry's `eventId` is the newly created event, with the source event's
   id captured in `details`.
7. **`admin/audit-log.vue`'s `ACTION_LABELS` map gets entries for the six
   new action names this feature introduces** (`event_created`,
   `event_published`, `event_details_updated`, `event_settings_updated`,
   `event_branding_updated`, `event_duplicated`) - not a backfill of the
   pre-existing gap for other already-shipped actions (`report_generated`,
   `question_edited`, etc. are unrelated and untouched), only the ones this
   feature actually adds.
8. **Every new route replicates its client function's exact validation
   logic before writing** - name-required, slug/join-code format (reusing
   the existing `isValidSlug`/`isValidJoinCode`/`normalizeSlug`/
   `normalizeJoinCode` helpers), the four numeric settings checks, and hex
   color format (reusing `isValidHexColor`) - not a looser or stricter
   reimplementation.

## In scope

- **`server/api/admin/events.post.ts` (new).** `verifyAdministrator`-gated.
  Body: `{ name, templateId?: string | null }`. Replicates `createEvent()`
  exactly: validates `name`, retries up to 5 times on a slug/join-code
  unique-constraint collision (`23505`), inserts the event, then either
  copies the selected template's `event_settings`/`attendee_types` or
  inserts default `event_settings`. Returns `{ eventId, slug, joinCode,
  attendeeTypes }`. Logs `event_created` with `{ name, templateId }`.
- **`server/api/admin/events/[id]/publish.post.ts` (new).**
  `verifyAdministrator`-gated. Updates `events.status` to `'live'` for the
  given id. Logs `event_published`.
- **`server/api/admin/events/[id]/details.post.ts` (new).**
  `verifyEventAccess`-gated. Body: `{ name, slug, joinCode }`. Replicates
  `saveDetails()` exactly: name-required, slug/join-code format validation,
  the `23505` duplicate-slug-or-join-code error message. Logs
  `event_details_updated` with `{ name, slug, joinCode }`.
- **`server/api/admin/events/[id]/settings.post.ts` (new).**
  `verifyEventAccess`-gated. Body: the full settings payload
  `saveSettings()` currently sends (all `event_settings` fields plus
  `submissions_open`/`voting_open`/`moderator_access_enabled`). Replicates
  its four numeric-field validations exactly. Logs
  `event_settings_updated`.
- **`server/api/admin/events/[id]/branding.post.ts` (new).**
  `verifyEventAccess`-gated. Body: `{ accentColor, backgroundColor,
  welcomeText, themeMode }`. Replicates `saveBranding()`'s exact hex-color
  validation. Logs `event_branding_updated`.
- **`server/api/admin/events/[id]/duplicate.post.ts` (new).**
  `verifyAdministrator`-gated. Replicates `duplicateEvent()` exactly:
  copies name (with " (Copy)" suffix)/settings/attendee-type labels into a
  freshly created event, with the same 5-attempt collision retry. Returns
  `{ eventId }`. Logs `event_duplicated` on the new event's id with
  `{ duplicatedFromEventId: eventId }`.
- **`app/pages/admin/events/new.vue` (edit).** `createEvent()` and
  `publish()` call the two new routes via `$fetch` with the Bearer session
  token, replacing their direct `supabase.from(...)` calls. Every existing
  error message and the field-specific `:error` association stay
  identical.
- **`app/pages/admin/events/[id].vue` (edit).** `saveDetails()`,
  `saveSettings()`, `saveBranding()`, and `duplicateEvent()` call their
  four new routes the same way. Every existing error message and
  field-specific `:error` association stay identical.
- **`app/pages/admin/audit-log.vue` (edit).** Add the six new action
  labels to `ACTION_LABELS`.

## Out of scope

- **Attendee-type add/remove in either file** - not a named "major action",
  per the resolved note above; stays direct-client and RLS-gated.
- **`saveAsDraft()`** - no mutation, nothing to convert.
- **The other admin/EM-facing mutations in `event-managers.vue`** - Feature
  43b, a separate spec.
- **Backfilling `ACTION_LABELS` for other already-shipped, unrelated
  actions** - only the six this feature introduces are added.
- **Any change to what these mutations actually do** - this is a transport
  and logging change (client Supabase call -> server route -> service-role
  write, plus an audit entry), not a behavior or validation change.

## Build loop

Per `blueprint/config.json`: `stepReview: feature` (one review packet after
all steps) and `checkpointCommits: disabled` (no intermediate commits;
`/complete` makes the final commit).

## Build steps

- [x] 1. **Create and publish routes** - `server/api/admin/events.post.ts`,
      `server/api/admin/events/[id]/publish.post.ts`; wire both into
      `app/pages/admin/events/new.vue`.
      **Done when:** code builds; both routes are `verifyAdministrator`-
      gated; the create route's validation and collision-retry logic
      matches `createEvent()` exactly; both write their audit action
      (confirmed by code review, since exercising a real Supabase project
      is outside this skill).
- [x] 2. **Details and settings routes** -
      `server/api/admin/events/[id]/details.post.ts`,
      `server/api/admin/events/[id]/settings.post.ts`; wire both into
      `app/pages/admin/events/[id].vue`.
      **Done when:** code builds; both routes are `verifyEventAccess`-
      gated; their validation matches `saveDetails()`/`saveSettings()`
      exactly; both write their audit action.
- [x] 3. **Branding and duplicate routes** -
      `server/api/admin/events/[id]/branding.post.ts`,
      `server/api/admin/events/[id]/duplicate.post.ts`; wire both into
      `app/pages/admin/events/[id].vue`.
      **Done when:** code builds; the branding route is
      `verifyEventAccess`-gated and its validation matches
      `saveBranding()` exactly; the duplicate route is
      `verifyAdministrator`-gated and its collision-retry logic matches
      `duplicateEvent()` exactly; both write their audit action.
- [x] 4. **Audit log labels** - add the six new action labels to
      `app/pages/admin/audit-log.vue`'s `ACTION_LABELS`.
      **Done when:** code builds; all six new action names have a
      human-readable label.

## Files / areas

- `server/api/admin/events.post.ts` (new)
- `server/api/admin/events/[id]/publish.post.ts` (new)
- `server/api/admin/events/[id]/details.post.ts` (new)
- `server/api/admin/events/[id]/settings.post.ts` (new)
- `server/api/admin/events/[id]/branding.post.ts` (new)
- `server/api/admin/events/[id]/duplicate.post.ts` (new)
- `app/pages/admin/events/new.vue` (edit)
- `app/pages/admin/events/[id].vue` (edit)
- `app/pages/admin/audit-log.vue` (edit)

## Data / contracts

- **Response envelope:** `{ success, data, error }` throughout, matching
  every other server route in this project.
- **Authorization:** `verifyAdministrator` for create/publish/duplicate;
  `verifyEventAccess` for details/settings/branding - per the resolved
  note above, matching each action's real current boundary exactly.
- **New audit actions:** `event_created`, `event_published`,
  `event_details_updated`, `event_settings_updated`,
  `event_branding_updated`, `event_duplicated` - each logged via the
  existing `logAuditAction` helper.

## Testing

No test runner configured; `npm run build` is the automated check for all
four steps. **Not yet exercised live:** the full create/publish/edit/
duplicate flow against a real Supabase project, and the audit log actually
recording each new entry - both require a running server and a real
Supabase project, the same caveat recorded for every prior feature that
could not start a server from this skill.

## Notes for the AI

- Do not use `verifyAdministrator` for details/settings/branding - use
  `verifyEventAccess`, or Event Managers lose an ability they currently
  have via RLS.
- Do not use `verifyEventAccess` for create/publish/duplicate - use
  `verifyAdministrator`, matching their real current restriction.
- Do not convert attendee-type add/remove or `saveAsDraft()` - out of
  scope, per the resolved note above.
- Do not change any validation rule, error message, or response shape -
  this is a transport and audit-logging change only.
- Reuse the existing `isValidSlug`/`isValidJoinCode`/`normalizeSlug`/
  `normalizeJoinCode`/`isValidHexColor` helpers server-side rather than
  reimplementing them.
- Keep each new route's `logAuditAction` `details` payload minimal,
  matching this project's existing style - not a full field diff.

## Deviation from spec

- `duplicate.post.ts` re-fetches the source event's `name` from the
  database rather than trusting a client-supplied value. The original
  client code built the copy's name from the in-memory, possibly-unsaved
  `name.value` form field; the server route re-derives it from a fresh
  service-role lookup instead, matching this codebase's existing
  `verifyEventAccess` precedent of never trusting client-supplied data for
  a server-authoritative action. Observable only if an admin edits the
  Details form and clicks Duplicate before saving.
