# Ops Hub

Private agency-operations app for First Pass Data and 369 Agentic Systems. The full spec is
[docs/BUILD_PLAN.md](docs/BUILD_PLAN.md). Work happens one phase at a time, one pull request per phase.

**Status:** Phase 0 (foundation): sign-in with magic link + enforced TOTP MFA, orgs/brands/members/roles,
append-only audit log, RLS everywhere, service-token table and restricted roles, CI.
Phase 1 (CRM): companies, contacts, deal boards per brand with live updates, timeline, tasks, comments with
@mentions, inbox + daily digest (local mail catcher only), public lead form with consent, contact CSV import with the
import guard, booking links, cross-sell suggestion tasks.
Phase 2 (jobs): client accounts, jobs board, job pages with intake checklist and manual audits, drafts with immutable
hashed versions and a word diff, a rules-as-data checks engine, review queue, two-person approvals, stage gates G1-G6
enforced in Postgres ([ADR 0001](docs/adr/0001-stage-gates.md)), and an outbox with manual release only.

## Local setup

Needs Node 22+, Docker Desktop, and Git. The Supabase CLI comes from `devDependencies`.

1. `npm install`
2. `npx supabase start` (first run downloads the Docker images)
3. `npx supabase db reset` (applies migrations and the invented seed data)
4. `cp .env.example .env.local`, then paste `API_URL`, `ANON_KEY` and `SERVICE_ROLE_KEY` from
   `npx supabase status -o env` into `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
   `SUPABASE_SERVICE_ROLE_KEY`, and set `AUDIT_IP_HASH_SALT` to the output of `openssl rand -base64 32`
   and `CRON_SECRET` to the output of `openssl rand -hex 32`
5. Optional: set `SEED_OWNER_EMAIL` / `SEED_PARTNER_EMAIL` in `.env.local` and run `npm run seed:emails` to sign in
   with your own addresses (otherwise use `owner@example.test` / `partner@example.test`)
6. `npm run dev` and open http://127.0.0.1:3000 (use `127.0.0.1`, not `localhost`, so cookies match)
7. Enter a seed email, then open the sign-in link from the local mail catcher at http://127.0.0.1:54324
8. Owners, admins and operators set up an authenticator app on first sign-in

## Hosted Supabase settings (when we deploy)

`supabase/config.jsonc` only configures the local stack. The hosted project needs the same auth settings by hand:
signups off, magic-link expiry 900 s, session time-box 12 h, TOTP MFA on, Site URL = `APP_BASE_URL`, and the
**Invite user** email template from `supabase/templates/invite.html` (its link must go to
`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite`, because admin invites don't use PKCE).

## Phase 1 endpoints

- Public lead form: `/f/<form id>` (the link and an iframe snippet are on **Settings → Forms**). It posts to
  `/api/forms/<form id>`, which also accepts JSON from your own site. Honeypot field `website_url`; per-IP limit
  `FORMS_RATE_LIMIT_PER_MIN` (default 10). The IP is stored only as a salted hash. When hosted, the IP comes from
  `x-forwarded-for`, so the app must sit behind a proxy that sets it (Vercel does).
- Daily digest: `POST /api/cron/notification-digest` with `Authorization: Bearer $CRON_SECRET`. Phases 0-2 send it
  to the local mail catcher only (`MAILER_DRIVER=local`).

## Checks

| Command             | What it runs                                                             |
| ------------------- | ------------------------------------------------------------------------ |
| `npm run lint`      | ESLint                                                                   |
| `npm run typecheck` | Next route types + `tsc --noEmit` (strict)                               |
| `npm test`          | Vitest unit tests, including security grep guards                        |
| `npm run test:db`   | pgTAP database tests: RLS allow/deny per role, audit log, service roles  |
| `npm run test:e2e`  | Playwright against `npm run build` output and the local stack            |
| `npm run db:types`  | Regenerates `src/types/db.ts` after a migration (CI fails if it's stale) |

CI (`.github/workflows/ci.yml`) runs all of the above plus `npm audit` and a gitleaks secret scan on every PR.

## Rules that never bend

- Separate from `aafes-pim-pipeline`: no shared code, data or database.
- No real client data, keys or tokens in the repo or in chats. All seed and test data is invented.
- Every state change is permission-checked in server code **and** Postgres RLS, and is written to `audit_log`.
- Nothing outbound without human approval. The outbox only records manual releases ("I sent it"). Booking links are stored as links; the
  scheduling service is never called.

## Layout

```
app/                 Next.js routes (App Router): (auth) login + MFA, (app)/[org] internal app
proxy.ts             session refresh + signed-out redirect (Next 16 "proxy", formerly middleware)
src/server/          server-only modules: db clients, auth, permissions, audit, config
src/components/      UI (shadcn/ui-style components in src/components/ui)
supabase/migrations  SQL schema, functions, RLS
supabase/tests       pgTAP tests
tests/unit, tests/e2e
docs/                BUILD_PLAN.md, ADRs, UAT scripts
```
