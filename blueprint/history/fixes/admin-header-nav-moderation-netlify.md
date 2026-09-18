# Admin dashboard navigation, moderation, and Netlify deploy support

**Type:** Fix
**Status:** verified
**Branch:** `fix/admin-header-nav`

### The problem

Three small, related admin-surface gaps were fixed together on this branch:

1. **No shared admin navigation.** `app/pages/admin/index.vue` was the only admin
   page with navigation links. Every other `/admin/*` page had no way back to
   the rest of the section except the browser back button.
2. **Administrators couldn't moderate questions.** The admin dashboard's
   Questions tab only offered Edit/Delete/Permanently delete - no Approve,
   Reject, Publish, Hide, Mark answered, or Archive. An Administrator had to
   separately know the event's moderator password and switch to `/m/[slug]`
   to do anything a real moderation workflow needs.
3. **No Netlify deploy path.** The project only supported a `node-server`
   Nitro preset and had no Netlify build configuration, blocking deployment
   to Netlify via GitHub.

### The fix

1. Add a Nuxt layout (`app/layouts/admin.vue`) with a persistent header:
   app name/link to `/admin`, role-aware nav links, and the existing logout
   button. Apply it to every `/admin/*` page except `admin/login.vue`
   (pre-auth, no nav to show). Role scoping matches the middleware already
   guarding each route:
   - **Administrator** (no `administrator-only` restriction): Events, Create
     Event, Restore from Backup, Event Managers, Templates, Blocked Terms,
     Audit Log, Usage & Guardrails.
   - **Event Manager** (blocked by `administrator-only`): Events only.
2. Add `server/api/admin/events/[id]/questions/moderate.post.ts`, reusing the
   same `verifyEventAccess` auth and `computeModerationUpdate` rules already
   enforced on the moderator queue (`/m/[slug]`), and add Approve/Reject/
   Publish/Hide/Mark answered/Archive buttons to the admin Questions tab in
   `app/pages/admin/events/[id].vue`, using the same button-availability logic
   as the moderator page.
3. Set `nitro.preset` in `nuxt.config.ts` to `netlify` when the `NETLIFY`
   build environment variable is present (otherwise keep `node-server`), and
   add `netlify.toml` pinning the build command (`npm run build`), publish
   directory (`.output/public`), and Node version (22, matching
   `package.json`'s `engines`).

Must not break:

- Existing `admin` / `administrator-only` middleware redirects.
- `admin/login.vue` staying nav-free and outside the authenticated layout.
- Each page's own content/logic - the header is only a shared shell, and the
  moderation buttons are additive to the existing Edit/Delete controls.
- The existing `node-server` deploy target (Render or similar), which stays
  the default preset outside a Netlify build.

### Build steps

- [x] 1. Create `app/layouts/admin.vue` with the header (role-aware links + logout,
   reusing the logic currently in `admin/index.vue`). Set `layout: 'admin'` in
   `definePageMeta` on every `/admin/*` page except `admin/login.vue`. Remove
   the now-duplicated flat link list and logout button from `admin/index.vue`,
   leaving its own dashboard content (profile/role line) in place.
   **Done when:** logging in as an Administrator shows the header with all
   admin links on every admin page (except login), the active/current page is
   still fully functional, and logging in as a restricted Event Manager shows
   only the Events link.
- [x] 2. Add the `moderate` admin endpoint and wire Approve/Reject/Publish/Hide/
   Mark answered/Archive buttons into the admin Questions tab.
   **Done when:** an Administrator can approve then publish a pending question
   from the admin dashboard alone, with no need to visit `/m/[slug]`.
- [x] 3. Make the Nitro preset conditional on `NETLIFY` and add `netlify.toml`.
   **Done when:** `npm run build` still succeeds locally (using `node-server`),
   and the committed `netlify.toml` declares the build command, publish
   directory, and Node version a Netlify site would need.

### Verify

- Log in as an Administrator, click through Events, Templates, Event Managers,
  Blocked Terms, Audit Log, and Usage & Guardrails - the header with all links
  stays visible and working on each. Log in as an Event Manager - only the
  Events link appears; direct navigation to an administrator-only URL still
  redirects/blocks as before. `admin/login.vue` renders without the header.
  **Verified** live against the deployed admin UI.
- On the admin Questions tab, Approve a pending question, then Publish it -
  status updates to `approved`/`public` and the button set changes to
  Reject/Hide/Mark answered/Archive, matching the moderator queue's rules
  exactly. **Verified** end-to-end against live Supabase data (authenticated
  as the real Administrator account via a magic-link session), including a
  clean revert of the test question back to `pending`/`hidden` afterward.
- `npm run build` passes locally with the default `node-server` preset (no
  `NETLIFY` env var set). The `netlify` preset path itself can only be
  exercised by an actual Netlify build and is not deploy-verified here;
  deployment remains a separate, explicit step. Re-confirmed at `/complete`
  time in this session.
