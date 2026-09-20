## Feature 45: Public landing page

**Branch:** `feature/public-landing-page`
**Status:** verified

### Goal

Replace the current placeholder `app/pages/index.vue` ("Hello, Is this thing on??")
with a real `/` landing page: a hero section with a headline, subtext, and a
single call-to-action button. The button sends an already-authenticated
Administrator to `/admin` and everyone else (signed out, or a signed-in Event
Manager) to `/admin/login`.

### Design reference

The user pasted a screenshot (a "Taxo" healthcare-product landing page made in
Framer) as a rough style guide. No image file was available to store under
`blueprint/reference/` (it arrived inline in chat with no accessible file
path), so this is a written description instead of a stored asset:

- Full-viewport dark hero (near-black/navy) with a soft blue-glow gradient
  blob and a lighter, hazy top-right region.
- A large headline mixing a serif italic accent word ("Intelligent") with a
  plain sans-serif word ("healthcare"), centered.
- A short one-to-two-line subtext directly below the headline, smaller and
  muted.
- One pill-shaped, white/light, high-contrast CTA button centered below the
  subtext.
- No visible top navigation bar is part of this feature (the screenshot's nav
  belongs to the gallery site it was captured from, not the reference design).

LiveQA_1 has no established public marketing identity yet, so exact colors,
gradient treatment, and copy are this feature's implementation detail, not a
locked contract. Reuse `@nuxt/ui` / Tailwind utilities already in the project;
do not add a new CSS/animation dependency for the gradient effect (a CSS
gradient background is sufficient).

### In scope

- Static hero markup and copy for `/` (headline, subtext, one CTA button).
- Client-side auth check, reusing the existing `getAuthenticatedProfile`
  composable helper (`app/composables/useAuthSession.ts`) and `useSupabase()`
  client, exactly as `app/layouts/admin.vue` already does.
- CTA `href`/navigation target:
  - Authenticated profile with `role === 'administrator'` -> `/admin`.
  - Anything else (no session, or an authenticated Event Manager) ->
    `/admin/login`.
- Page-level accessibility: one `<h1>`, visible focus state on the button,
  sufficient text contrast against the dark background, decorative gradient
  background not exposed to assistive tech as content.

### Out of scope

- Any change to `/admin`, `/admin/login`, or the admin layout/middleware
  themselves. This page only links to them; it does not change how they
  authenticate or authorize.
- Any change to `getAuthenticatedProfile` or the `profiles` table/role model.
- A top navigation bar, footer, additional marketing sections, or additional
  routes.
- Event Manager-specific landing behavior beyond "not an Administrator, so
  send to `/admin/login`" - this is an explicit, user-confirmed choice, not a
  gap to fix later.
- Storing the reference screenshot as a file (none was available).

### Build steps

- [x] 1. Build the static hero UI in `app/pages/index.vue`: `<h1>` headline,
  subtext paragraph, and one `UButton` CTA, styled as a full-viewport dark
  hero with a CSS gradient background, matching the layout described in
  "Design reference" (no `NuxtLayout` override needed - this route already
  renders without a layout, like `app/pages/join.vue`). Default the CTA to
  `/admin/login` for now (step 2 wires the real check).
  **Done when:** `npm run dev`, visiting `/` shows the hero with headline,
  subtext, and one centered CTA button, and `npm run build` still passes.
  **Done:** `npm run build` passes.
- [x] 2. Wire the auth-aware CTA target: on mount, call
  `getAuthenticatedProfile(useSupabase())`; if the resolved profile's `role`
  is `administrator`, point the CTA at `/admin`, otherwise leave it at
  `/admin/login`.
  **Done when:** logged out, the CTA goes to `/admin/login`; logged in as the
  real Administrator account, the CTA goes to `/admin`; logged in as an Event
  Manager, the CTA still goes to `/admin/login`. `npm run build` passes.
  **Done:** `npm run build` passes; the mounted check mirrors
  `app/layouts/admin.vue`'s already-verified `getAuthenticatedProfile` usage
  exactly. The user's own dev server (port 3005) was checked directly -
  `curl http://localhost:3005/` returned HTTP 200 with the new headline text
  and the default `/admin/login` CTA link present in the HTML, and the user
  confirmed the page rendered correctly in their browser. The
  logged-in-as-Administrator CTA target was not separately click-verified.

### Files / areas

- `app/pages/index.vue` - full rewrite of the placeholder content.
- Reuses without modification: `app/composables/useAuthSession.ts`
  (`getAuthenticatedProfile`), the `useSupabase()` composable.

### Data / contracts

None. No new database columns, API routes, or server logic - this page only
reads the existing client-side Supabase session via the already-shipped
`getAuthenticatedProfile` helper. The actual authorization boundary remains
the existing `admin` route middleware on `/admin/*`; this page's check is a
navigation convenience only; it must never be treated as, or replace, that
server/middleware-enforced boundary.

### Testing

No test runner is configured in this project (`AGENTS.md` Commands has no
`test` entry), and this step is UI-only with no parseable/formattable logic
(the routing rule is a one-line role comparison already covered by
`getAuthenticatedProfile`'s existing behavior) - per
`coding-standards.md`'s testing scope rule, this is verified with the dev
server and `npm run build`, not a unit test.
