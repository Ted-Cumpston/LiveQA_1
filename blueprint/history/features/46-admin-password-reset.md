## Feature 46: Admin password reset

**Branch:** `feature/admin-password-reset`
**Status:** verified

### Goal

Add a self-service "forgot password" flow for existing Administrator and Event
Manager accounts: request a reset email from `/admin/login`, then set a new
password from the emailed link. This was explicitly deferred when Feature 2
(Administrator authentication) shipped ("add later if asked for") and is now
being asked for.

### Design reference

The user pasted two screenshots (a generic SaaS "Log in" page with Google/
Microsoft/email options and a "Sign up now" link, and a "Reset password" page
with a purple button and pink corner-triangle branding) as a rough guide. Two
explicit, user-confirmed scope decisions narrow what actually gets built from
them:

- **No public sign-up.** LiveQA_1's account model stays closed: Administrators
  are created only via the operator-run `scripts/create-admin.mjs` ("never
  exposed in the app" per Feature 2's own archived spec), and Event Managers
  are created only by an existing Administrator through
  `admin/event-managers.vue`. This feature adds no sign-up form and no new way
  to create an account.
- **No OAuth.** No Google/Microsoft login - email/password only, matching
  `admin/login.vue` today. Supabase OAuth provider credentials are not
  available/configured.

That leaves only the "Reset password" screenshot's interaction pattern
(request email -> set new password) as the actual reference, and even that is
adapted, not replicated pixel-for-pixel: `admin/login.vue` and the rest of the
admin auth surface are plain, unbranded `UAuthForm` cards with no hero,
gradient, or brand color today. The two new pages reuse that exact existing
look (same `UAuthForm` component, same `flex min-h-screen items-center
justify-center` centered-card layout as `admin/login.vue`) instead of
introducing the screenshot's purple/pink branding, so the admin auth surface
stays visually consistent with itself.

### In scope

- A "Forgot password?" link on `admin/login.vue`, pointing to
  `/admin/forgot-password`.
- `app/pages/admin/forgot-password.vue`: one email field; on submit, call
  `supabase.auth.resetPasswordForEmail(email, { redirectTo: <origin>/admin/reset-password })`
  and always show the same generic confirmation message ("If an account
  exists for that email, we've sent a reset link") regardless of whether the
  email matches a real account - this must never reveal account existence.
  Only a genuine thrown/network error shows a distinct, generic error message
  ("Something went wrong. Please try again.").
- `app/pages/admin/reset-password.vue`: on mount, detect the Supabase
  recovery session (the client SDK parses the emailed link's token
  automatically). With a valid recovery session, show a new-password form
  (password + confirm password, client-side match check) that calls
  `supabase.auth.updateUser({ password })` on submit, then resolves
  `getAuthenticatedProfile` and navigates to `/admin` on success. Without a
  valid recovery session (missing, invalid, or expired token, or the page
  visited directly with no token), show an "this link is invalid or expired"
  state with a link back to `/admin/forgot-password` - never a crash or a
  blank form.
- Excluding both new paths from `app/middleware/admin.ts`'s
  authenticated-profile redirect, exactly like `/admin/login` already is,
  since both must be reachable without an existing session.

### Out of scope

- Public sign-up / self-registration of any kind, for any role.
- Google/Microsoft OAuth or any other identity provider.
- Changing password strength/policy (Supabase Auth's own configured minimum
  applies; its error message is surfaced as-is).
- "Change my password" while already logged in (a different, admin-settings
  feature, not this one).
- MFA, session-length configuration, or additional rate limiting beyond
  Supabase Auth's own built-in limits on `resetPasswordForEmail`.
- Customizing the Supabase Auth recovery email template - the project's
  default template is used as-is.
- Any change to `admin/event-managers.vue`, `scripts/create-admin.mjs`, or how
  accounts are created.

### Build steps

- [x] 1. Add the "Forgot password?" link to `admin/login.vue` (in the
  `UAuthForm`'s `#footer` slot, linking to `/admin/forgot-password`). Create
  `app/pages/admin/forgot-password.vue`: single email field via `UAuthForm`,
  submit calls `resetPasswordForEmail` and always renders the same generic
  success message on completion (whether or not Supabase reports an error for
  an unknown email - it does not, by design, but this must not add its own
  existence check on top). A genuine thrown error shows a distinct generic
  error message instead. Add `/admin/forgot-password` to the admin
  middleware's pre-auth allowlist.
  **Done when:** `admin/login.vue` shows a working "Forgot password?" link;
  visiting `/admin/forgot-password` while logged out renders the form (no
  redirect to login); submitting any email address shows the same generic
  confirmation message; `npm run build` passes.
  **Done:** `npm run build` passes. `curl http://localhost:3005/admin/login`
  and `.../admin/forgot-password` both return HTTP 200 (route reachable, no
  server error) via the user's already-running dev server; `/admin/**` is
  client-rendered (`ssr: false`), so curl cannot see the hydrated content -
  self-reviewed the diff instead against `admin/login.vue`'s exact existing
  pattern. During self-review, caught and fixed a gap where a genuine
  `resetPasswordForEmail` error (returned, not thrown, per supabase-js v2
  convention) would have been silently swallowed as fake success; now checked
  explicitly, matching `login.vue`'s own `{ error }` destructuring.
- [x] 2. Create `app/pages/admin/reset-password.vue`: on mount, resolve
  whether a valid Supabase recovery session exists; render the invalid/expired
  state when it does not, or the new-password form when it does. Submitting a
  matching, non-empty password pair calls `updateUser`, then
  `getAuthenticatedProfile`, then navigates to `/admin`; a mismatched pair
  shows an inline validation error without calling Supabase; an `updateUser`
  error (e.g. below Supabase's configured minimum length) shows it inline. Add
  `/admin/reset-password` to the admin middleware's pre-auth allowlist.
  **Done when:** visiting `/admin/reset-password` directly (no recovery
  token) shows the invalid/expired state with a link back to
  `/admin/forgot-password`, not a crash or blank page; a mismatched
  password/confirm pair shows an inline error and does not call Supabase;
  `npm run build` passes.
  **Done:** `npm run build` passes; `curl .../admin/reset-password` returns
  HTTP 200 (same SPA-shell caveat as step 1 - no server error, content not
  visible to curl). The real recovery-token flow (clicking an actual emailed
  link) cannot be exercised in this session at all - it needs a live Supabase
  project and a real inbox, as flagged in the spec's Testing section.

### Files / areas

- `app/pages/admin/login.vue` - add the "Forgot password?" link only.
- `app/pages/admin/forgot-password.vue` - new.
- `app/pages/admin/reset-password.vue` - new.
- `app/middleware/admin.ts` - extend the pre-auth path allowlist.
- Reuses without modification: `app/composables/useAuthSession.ts`
  (`getAuthenticatedProfile`), the `useSupabase()` composable.

### Data / contracts

None. No new database columns, tables, or server API routes. Both pages call
the Supabase Auth client SDK directly (`resetPasswordForEmail`, `updateUser`),
exactly like `admin/login.vue` already calls `signInWithPassword` directly
with no server route in between. The redirect target embedded in the reset
email (`redirectTo`) must be `/admin/reset-password` on whatever origin the
app is currently running on.

**Operational dependency (not code, flagged so it isn't silently assumed
working):** for the reset email to actually deliver, the deployed Supabase
project's Auth settings must have `/admin/reset-password` covered by its Site
URL / redirect URL allowlist (the same setting `DEPLOYMENT.md` already
documents updating for the production subdomain) and have email sending
enabled. This is the first feature in this project that relies on Supabase
sending a transactional email - verify delivery against the real project
before considering this feature done end-to-end.

### Testing

No test runner is configured in this project (`AGENTS.md` Commands has no
`test` entry). Both steps are UI-only, and the only non-trivial logic (the
password/confirm-password match check) is a one-line comparison - per
`coding-standards.md`'s testing scope rule this is verified with the dev
server and `npm run build`, not a unit test. Full end-to-end verification
(actually receiving a reset email and completing the flow) needs a live
Supabase project and a real inbox, which cannot be exercised from this coding
session - flagged above as a manual follow-up.
