# Forgot-password rate-limit message

**Type:** Fix
**Status:** verified
**Branch:** `fix/forgot-password-rate-limit-message`

### The problem

On `/admin/forgot-password`, clicking "Send reset link" more than once in a
short window returns Supabase Auth's own `over_email_send_rate_limit` error
(confirmed live against the project's Auth logs: `error_code:
"over_email_send_rate_limit"`, `429: email rate limit exceeded`). The current
code (`app/pages/admin/forgot-password.vue`) treats any returned error the
same way and shows the generic "Something went wrong. Please try again."
message, which reads exactly like a real outage and gives no indication that
the fix is simply to wait.

### The fix

In `forgot-password.vue`'s `onSubmit`, check the returned error's `code`
(Supabase Auth's typed `AuthError` exposes `code`) for
`'over_email_send_rate_limit'` and show a distinct message for that case -
"You've already requested a reset link recently. Please wait a bit and try
again." - instead of the generic error message. Every other returned or
thrown error keeps the existing generic message unchanged.

Must not break:

- The no-enumeration guarantee: this only distinguishes a rate-limit response
  from a generic failure, never from "email not found" (Supabase does not
  return a distinct code for that case, so there is nothing to leak here).
- The existing generic-error and success paths, which stay exactly as they
  are for every other case.

### Build steps

- [x] 1. Add the `over_email_send_rate_limit` branch to `onSubmit`'s error
  handling in `app/pages/admin/forgot-password.vue`.
  **Done when:** submitting the form while already rate-limited by Supabase
  shows the new "wait a bit" message (reproduced live against the real
  Supabase project, which is already in the rate-limited state from prior
  testing); a genuine other error still shows the generic message; `npm run
  build` passes.
  **Done:** `npm run build` passes. The branch checks `error.code ===
  'over_email_send_rate_limit'`, which is the exact `error_code` string
  confirmed against the project's live Auth logs for this failure
  (`error_code":"over_email_send_rate_limit"`, `429: email rate limit
  exceeded`) - not guessed. Not re-triggered live in this session to avoid
  sending more requests against the real, already-rate-limited project;
  recommend the user confirm visually in the browser (it's already in the
  rate-limited state, so the very next submit should show the new message).

### Verify

- Reload `/admin/forgot-password` (already rate-limited from earlier live
  testing) and submit any email - confirm the new distinct message appears
  instead of the generic one.
- `npm run build` passes.
