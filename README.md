# Ops Hub

Private agency-operations app for First Pass Data and 369 Agentic Systems. The full spec is
[docs/BUILD_PLAN.md](docs/BUILD_PLAN.md). Work happens one phase at a time, one pull request per phase.

**Status:** Phase 0 (foundation): sign-in with magic link + enforced TOTP MFA, orgs/brands/members/roles,
append-only audit log, RLS everywhere, service-token table and restricted roles, CI.

## Local setup

Needs Node 22+, Docker Desktop, and Git. The Supabase CLI comes from `devDependencies`.

1. `npm install`
2. `npx supabase start` (first run downloads the Docker images)
3. `npx supabase db reset` (applies migrations and the invented seed data)
4. `cp .env.example .env.local`, then paste `API_URL`, `ANON_KEY` and `SERVICE_ROLE_KEY` from
   `npx supabase status -o env` into `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
   `SUPABASE_SERVICE_ROLE_KEY`, and set `AUDIT_IP_HASH_SALT` to the output of `openssl rand -base64 32`
5. Optional: set `SEED_OWNER_EMAIL` / `SEED_PARTNER_EMAIL` in `.env.local` and run `npm run seed:emails` to sign in
   with your own addresses (otherwise use `owner@example.test` / `partner@example.test`)
6. `npm run dev` and open http://127.0.0.1:3000 (use `127.0.0.1`, not `localhost`, so cookies match)
7. Enter a seed email, then open the sign-in link from the local mail catcher at http://127.0.0.1:54324
8. Owners, admins and operators set up an authenticator app on first sign-in

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
- Nothing outbound without human approval (outbox arrives in Phase 2).

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
