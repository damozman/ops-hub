# ADR 0003: Rendering model and sign-in flow

Date: 2026-11-26 · Status: accepted · Phase 0

## Decision

- **Next.js 16, App Router, `cacheComponents` off.** Every internal page reads the session and per-user RLS data, so
  pages render per request. Caching can be adopted per route later if a page is slow.
- **`proxy.ts`** (Next 16's name for middleware) refreshes the Supabase session cookie and sends signed-out visitors
  to `/login`. It is an optimistic check only; pages, server actions and RLS each check again.
- **Magic link only, invite-only.** `enable_signup=false` and `shouldCreateUser: false`; the login form gives the
  same answer for known and unknown addresses. Links expire in 15 minutes. Sessions are time-boxed to 12 hours.
- **TOTP MFA** is required for owner/admin/operator (and for anyone who enrolled a factor). The app sends such users
  to `/mfa` before any app page; RLS refuses their data until the session is `aal2` (see ADR 0002).
- **Redirects use `APP_BASE_URL`**, never the request Host header.
- **UI kit:** shadcn/ui-style components are vendored in `src/components/ui` (the shadcn CLI couldn't reach its
  registry from the build environment; `components.json` is in place for later `npx shadcn add`).
