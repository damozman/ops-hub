# Claude kickoff prompt — Ops Hub, Phases 0–2

Chris: paste everything below the line into a new Claude session opened in the empty folder of the **new** repo. Before that, do Step 0 yourself.

**Step 0 (Chris, by hand, once):**
1. On GitHub, create a new **private, empty** repo under `damozman` (suggested name `ops-hub`; final name is Decision D1). Do not fork or copy `aafes-pim-pipeline`.
2. Clone it into a new folder that is **not** inside the `aafes-pim-pipeline` folder.
3. Copy `BUILD_PLAN.md` into it as `docs/BUILD_PLAN.md`.
4. Make sure Node LTS, Docker Desktop, Supabase CLI, and GitHub CLI (`gh auth status` shows `damozman`) are installed.
5. Settings → Branches on GitHub: protect `main` (require a pull request and passing checks; no direct pushes).
6. Nothing in this session needs real client data, real API keys, or any paid account.

---

You are building **Ops Hub**, a private agency-operations app for Chris Mosley (First Pass Data and 369 Agentic Systems, Fort Worth TX). The full spec is `docs/BUILD_PLAN.md`; read sections 0–3, 5, 6 and 7 now. This session covers **Phases 0, 1 and 2 only**, built in that order, one pull request per phase. The phases are foundation-first: they must lay the hooks later phases rely on (listed below) so nothing has to be reworked later.

## A. Hard rules (stop and ask Chris if any instruction conflicts with these)
1. This repo is **completely separate from `aafes-pim-pipeline`**. Do not read, import, copy, or reference its code, database, files, or roadmap.
2. **No real client data.** All seed and test data is invented (see §H). Never ask Chris to paste customer lists, AAFES files, or client documents.
3. **No secrets in the repo or in chat.** Use `.env.local` (git-ignored) and `.env.example` with names only. If you need a value, tell Chris which env var to set.
4. **Nothing outbound.** Phases 0–2 send no real email or SMS and call no third-party APIs except Supabase. Email in dev goes to the Supabase local mail catcher.
5. **No password fields for client accounts**, ever. Only Supabase Auth handles user passwords / magic links.
6. Do not create accounts, repos, or services. Do not modify Chris's Cal.com setup in any way.
7. Every state change must be permission-checked in **both** server code and Postgres RLS, and must write `audit_log`.
8. Work on branches, open PRs to `main` with `gh pr create`, and **never merge** — Chris merges after Jack (Grok Bot) reviews.

## B. Stack (pin exact versions in `package.json` when you install; use current stable releases)
- Next.js (App Router) + TypeScript `strict`, React Server Components + server actions
- Tailwind CSS + shadcn/ui
- Supabase: Postgres, Auth (magic link + TOTP MFA), Storage, Realtime; Supabase CLI for local stack, SQL migrations in `supabase/migrations`, `supabase gen types typescript` → `src/types/db.ts`
- `@supabase/ssr` for auth in Next.js
- Zod for all input validation
- Vitest (unit), `supabase test db` with pgTAP (database/RLS), Playwright (e2e)
- ESLint + Prettier, gitleaks in CI
- GitHub Actions CI: install → lint → typecheck → unit → start Supabase local → `supabase db reset` → `supabase test db` → build → Playwright smoke
- Hosting later: Vercel (do not deploy in this session unless Chris asks)

## C. Repo layout
```
/app
  /(auth)/login, /(auth)/mfa
  /(app)/[org]/dashboard, /crm/{companies,contacts,deals}, /tasks, /inbox,
    /jobs, /jobs/[id], /review-queue, /outbox, /settings/{org,brands,members,checks,import-guard}
  /f/[formId]           public lead form (embeddable)
  /api/forms/[formId]   form submit endpoint
/src/server/{db,auth,permissions,audit,events,crm,jobs,checks,outbox,files,mailer}
/src/components
/supabase/migrations  /supabase/seed.sql  /supabase/tests
/tests/unit  /tests/e2e
/docs/BUILD_PLAN.md  /docs/adr/  /docs/uat/phase-{0,1,2}.md
.env.example  .github/workflows/ci.yml  .github/pull_request_template.md
```

## D. Environment variables (names only — Chris fills `.env.local`; local values come from `supabase start`)
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY        # server only, never in client code
SUPABASE_DB_URL                  # tests/scripts only
APP_BASE_URL
APP_ENV                          # development | preview | production
DEPLOY_MODE                      # cloud | lan  (cloud for now)
AUDIT_IP_HASH_SALT               # random 32+ bytes
TOKEN_HASH_PEPPER                # random 32+ bytes (api_tokens hashing; used from Phase 3)
TOKEN_ENC_KEY                    # 32-byte base64 (OAuth token encryption; reserved for later phases)
MAILER_DRIVER                    # local | resend  (local for Phases 0–2)
FORMS_RATE_LIMIT_PER_MIN
SEED_OWNER_EMAIL                 # Chris's login email for local seed (not committed)
SEED_PARTNER_EMAIL               # partner's login email for local seed (not committed)
```
Reserved for later phases, add to `.env.example` commented out: `AI_GATEWAY_API_KEY`, `OLLAMA_BASE_URL`, `WORKER_CONCURRENCY`, `RESEND_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CRON_SECRET`, `SENTRY_DSN`.

## E. Data model for Phases 0–2
Every table: `id uuid primary key default gen_random_uuid()`, `org_id uuid not null references orgs`, `created_at timestamptz default now()`, `updated_at timestamptz`, `created_by uuid`. Brand-scoped tables also have `brand_id uuid references brands`. Use Postgres enums or check constraints for status fields. Add indexes on `org_id`, foreign keys, and common filters.

**Phase 0**
- `orgs(name, slug unique, settings jsonb)`
- `brands(org_id, key text check in ('fpd','369') or other lowercase slug, name, from_email, legal_footer, report_theme jsonb)` unique (org_id,key)
- `profiles(user_id uuid pk references auth.users, display_name, avatar_url)`
- `memberships(org_id, user_id, role check in ('owner','admin','operator','reviewer','viewer','client'), brand_ids uuid[] null, status check in ('active','invited','disabled'))` unique (org_id,user_id)
- `role_permissions(role, permission)` seeded. Permissions: `org.manage, members.manage, crm.read, crm.write, jobs.write, jobs.transition, drafts.write, drafts.approve, outbox.release, checks.manage, checks.override, audit.read, settings.manage`
- `settings(org_id, key, value jsonb)` unique (org_id,key) — includes `two_person_rule` (default true), `operator_can_approve` (default true), `operator_can_release` (default false)
- `audit_log(org_id, actor_id, actor_kind check in ('user','service','system'), action, subject_type, subject_id, before jsonb, after jsonb, ip_hash, request_id, at timestamptz default now())` — append-only
- `api_tokens(org_id, name, kind check in ('service:drafts','service:worker'), token_hash, scopes text[], allowed_brand_ids uuid[], expires_at, last_used_at, revoked_at)` — table only; no endpoints until Phase 3
- Postgres roles `svc_drafts` and `svc_worker` created with **no** table grants yet (Phase 3 adds narrow grants)

**Phase 1**
- `companies(org_id, name, website, industry, city, state, brand_ids uuid[], lifecycle check in ('lead','prospect','client','churned'), source, tags text[])`
- `contacts(org_id, company_id, first_name, last_name, email, phone_e164, title, owner_user_id, tags text[], do_not_contact bool default false)`
- `consents(org_id, contact_id null, email null, phone_e164 null, channel check in ('sms','email'), purpose check in ('marketing','transactional','review_request'), status check in ('granted','revoked'), method, consent_text_version, evidence jsonb, captured_at)` — append-only
- `pipelines(org_id, brand_id, name)`, `pipeline_stages(pipeline_id, org_id, name, position int, win_probability numeric)`
- `deals(org_id, brand_id, company_id, pipeline_id, stage_id, title, value_cents bigint, offer check in ('A','B','other'), expected_close date, owner_user_id, status check in ('open','won','lost'))`
- `activities(org_id, subject_type, subject_id, kind check in ('note','call','email_logged','meeting','stage_change','system'), body, occurred_at)`
- `tasks(org_id, brand_id null, title, body, assignee_user_id, due_at, status check in ('open','done','cancelled'), priority, subject_type, subject_id, recurring_rule text null)`
- `comments(org_id, subject_type, subject_id, body_md, mentions uuid[], resolved_at)`
- `notifications(org_id, user_id, kind, subject_type, subject_id, payload jsonb, read_at)`
- `events(org_id, type, subject_type, subject_id, payload jsonb, at)` — every domain action emits one
- `forms(org_id, brand_id, name, schema jsonb, consent_text, consent_text_version, redirect_url, active)`, `form_submissions(org_id, form_id, data jsonb, ip_hash, contact_id, deal_id)`
- `bookings(org_id, brand_id, source check in ('native','calcom','link'), external_id, contact_id, starts_at, ends_at, status, booking_url, raw jsonb)` — Phase 1 stores a booking link/notes only; Cal.com is not touched
- `files(org_id, bucket, path, mime, size, sha256, kind, sensitivity check in ('public','internal','client_confidential'), uploaded_by)` + private Storage bucket `org-files` with RLS on `storage.objects` by org
- `import_guard_signatures(org_id, label, header_signature text[], threshold numeric default 0.8)` — Chris enters his AAFES/PIM template headers later via settings; tests use invented headers

**Phase 2**
- `client_accounts(org_id, brand_id, company_id, status, data_sensitivity check in ('public_only','client_confidential'), ai_policy check in ('default','local_only'), portal_enabled bool, primary_contact_id)`
- `jobs(org_id, brand_id, client_account_id, offer check in ('A','B'), title, stage check in ('intake','audit','drafts','review','approved','delivered','upkeep','closed','cancelled') default 'intake', assignee_user_id, reviewer_user_id, due_at, scope jsonb, requires_client_approval bool default false, contract_ref text, subscription_active bool default false)`
- `job_stage_events(org_id, job_id, from_stage, to_stage, actor_id, actor_kind, reason, gate_results jsonb, at)` — append-only
- `intake_checklists(org_id, job_id unique, items jsonb)` — items `[{key,label,done,done_by,done_at,evidence}]`; default keys: `scope_set, brand_set, sensitivity_set, access_confirmed, owner_contact_set, contract_recorded`
- `job_items(org_id, job_id, kind check in ('listing','location','asset'), marketplace check in ('amazon','walmart','shopify','gbp','openai_feed','other'), external_ref, title, status)`
- `audits(org_id, job_id, engine check in ('listing','local','manual'), rules_version, status check in ('running','finished','failed'), score numeric, summary jsonb, finished_at)` — Phase 2 supports a **manual audit** (operator enters findings); engines come in Phases 4–5
- `audit_findings(org_id, audit_id, job_item_id, rule_key, severity check in ('blocker','major','minor','info'), field, message, evidence jsonb)`
- `drafts(org_id, job_id, job_item_id null, kind text, status check in ('draft','checks_failed','ready_for_review','changes_requested','approved','superseded','delivered'), current_version_id)`
- `draft_versions(org_id, draft_id, version int, content jsonb, content_hash text, author_kind check in ('user','ai','jack'), author_id, ai_run_id uuid null, created_at)` — immutable (no UPDATE/DELETE)
- `check_rules(org_id null, rule_key, pack, severity, params jsonb, version, active)` — rules as data, global defaults with `org_id null`
- `check_runs(org_id, draft_version_id, rules_version, passed bool, blocker_count, warning_count)`, `check_results(org_id, check_run_id, rule_key, severity, message, span jsonb, override_by, override_reason)`
- `approvals(org_id, subject_type check in ('draft_version','bundle','outbox_message','deliverable'), subject_id, content_hash, approver_id, kind check in ('internal','client'), decision check in ('approved','rejected','changes_requested'), stale bool default false, comment, decided_at)` — append-only except the `stale` flag set by trigger
- `outbox_messages(org_id, brand_id, job_id null, channel check in ('email','sms','gbp_post','gbp_reply','listing_push','manual'), recipient, subject, body, payload jsonb, content_hash, approval_id, status check in ('pending_approval','approved','queued','sent','failed','blocked','cancelled'), block_reason, scheduled_for, sent_at, sent_by, provider_id)`
- `deliverables(org_id, job_id, kind, file_id, status, approval_id, delivered_at, delivered_by)` — placeholder rows; exports come in Phase 4

## F. RLS and database functions (write these first, with tests)
Helper functions (`security definer`, `stable`, `search_path = public`):
- `auth_org_ids()` → org ids where the current user has an `active` membership
- `has_perm(p_org uuid, p_perm text)` → bool via memberships + role_permissions + settings overrides (`operator_can_approve`, `operator_can_release`)
- `can_brand(p_org uuid, p_brand uuid)` → true when `brand_ids` is null or contains the brand

Policy patterns (enable RLS on **every** table; no table without policies; default deny):
- Read: `org_id in (select auth_org_ids())` and, for brand-scoped tables, `can_brand(org_id, brand_id)`; CRM reads also require `has_perm(org_id,'crm.read')`.
- Write: same plus the matching permission (`crm.write`, `jobs.write`, `drafts.write`, `settings.manage`, `members.manage`).
- `client` role: no access to any internal table in Phases 0–2 (portal comes in Phase 7).
- `audit_log`: insert only via trigger function; select requires `audit.read` (operators see only rows where `actor_id = auth.uid()`); revoke UPDATE/DELETE from `authenticated`, `anon`, `service_role` paths and add a trigger that raises on UPDATE/DELETE.
- `draft_versions`, `job_stage_events`, `consents`, `events`: insert + select only; UPDATE/DELETE blocked by trigger.
- `jobs.stage`: revoke direct UPDATE of the `stage` column (column privilege) and also guard with a trigger; only `transition_job()` may change it.
- `approvals`: insert only through `approve_subject()`; `stale` set only by trigger.
- `outbox_messages.status` → `sent` only through `release_outbox()`.
- `svc_drafts` / `svc_worker`: no grants in Phases 0–2 (tests assert they can read nothing).

Functions:
- `audit_row()` trigger on all core tables: writes before/after json, actor from `auth.uid()` (or `service`), `request_id` from `current_setting('request.headers', true)` when present.
- `emit_event(type, subject_type, subject_id, payload)` called from domain functions/triggers.
- `canonical_hash(jsonb)` → sha256 hex of canonical JSON (keys sorted); identical algorithm implemented in TypeScript with a cross-check test.
- `transition_job(p_job uuid, p_to text, p_reason text)` `security definer`: checks `jobs.transition`, evaluates gates, writes `job_stage_events` with `gate_results`, raises a clear error naming each failed gate:
  - G1 intake→audit: all intake items done
  - G2 audit→drafts: an `audits` row `finished` with `rules_version`
  - G3 drafts→review: every in-scope draft's current version has a passing `check_runs` row (or a recorded override by `checks.override` with reason)
  - G4 review→approved: a non-stale `approved` internal approval for each in-scope draft's current `content_hash`; if `two_person_rule`, approver ≠ author of current version and ≠ last human editor; if `requires_client_approval`, a client approval for the bundle hash (always fails in Phase 2 unless the flag is false — portal arrives in Phase 7)
  - G5 approved→delivered: delivery checklist done and every job outbox item `sent` or `cancelled`
  - G6 delivered→upkeep: `subscription_active` true or owner override
  - Allowed back-moves: review→drafts, approved→drafts; any→cancelled by owner/admin
- Trigger on `draft_versions` insert: compute/verify `content_hash`, set draft `current_version_id`, mark prior approvals for that draft `stale = true`, and if the job is `approved`, move it back to `drafts` (writing a stage event with reason `content_changed_after_approval`).
- `approve_subject(p_subject_type, p_subject_id, p_decision, p_comment)`: checks `drafts.approve`, two-person rule, current hash; inserts approval.
- `release_outbox(p_id uuid)`: checks `outbox.release`; refuses unless approval exists, non-stale, `decision='approved'` and `approvals.content_hash = outbox_messages.content_hash`; in Phases 0–2 only marks `sent` with `sent_by` (manual send), no provider call.

## G. Checks engine (Phase 2)
- `src/server/checks/` pure TypeScript: `runChecks(content, context, rules) → CheckResult[]`; rules loaded from `check_rules` (data, versioned). Runs on **every** `draft_versions` insert regardless of author (`user`, later `ai` or `jack`).
- Seed rule packs from BUILD_PLAN §3.5, items 1–11. Length limits that vary by category are seeded with `params.verify = true` and shown with a "verify against current style guide" warning in settings.
- Required fixtures (each rule gets ≥1 pass and ≥1 fail unit test). Must-fail examples: "Guaranteed #1 ranking on Google", "If you loved your visit, leave us 5 stars — otherwise call us", "Get 10% off for leaving a review", a GBP description of 751 characters, an SMS body without STOP wording, a draft containing a fake API key like `sk_live_FAKE0000000000000000`, a numeric spec ("Load capacity 5,000 lb") not present in the job item source data.
- Results stored in `check_runs` / `check_results`; blockers set draft status `checks_failed`; clean runs set `ready_for_review`.

## H. Invented seed data (`supabase/seed.sql` + `tests/fixtures`) — all fictional
- Org "Mosley Ventures (dev)"; brands `fpd` "First Pass Data", `369` "369 Agentic Systems".
- Users from `SEED_OWNER_EMAIL` (owner) and `SEED_PARTNER_EMAIL` (operator); plus test users `reviewer@example.test`, `viewer@example.test`, `client@example.test`, `brandlimited@example.test` (only brand `369`), and a second org "Other Agency (test)" with `outsider@example.test`.
- Companies: "Lone Star Lift & Rack Supply (fictional)", "Trinity Paws Grooming (fictional)", "Cowtown Diesel Parts (fictional)", "Bluebonnet Candle Co. (fictional)". Phones only `+1817555010x`; emails only `@example.test`; websites `https://example.test/...`.
- Jobs: one Offer A job for Bluebonnet (3 invented SKUs with source data), one Offer B job for Trinity Paws.
- Import-guard test signature: label "TEST AAFES-like template", headers `["VENDOR_ITEM_NO","EXCH_DEPT","MFR_PART","UPC_CODE","RETAIL_PRICE"]` (invented, not real AAFES headers).

## I. Phase scopes, acceptance tests, definition of done

### Phase 0 — Foundation (branch `phase-0-foundation`)
Scope: scaffold Next.js + Tailwind + shadcn; Supabase local; migrations for Phase 0 tables, helper functions, RLS, audit trigger, append-only guards, `api_tokens` + `svc_*` roles (no grants); auth (magic link, TOTP MFA enforced for owner/admin/operator before any app page); org/brand switcher shell; members page (invite = create membership row with `invited`; no emails sent beyond the local mail catcher); settings page; seed; CI; `.env.example`; PR template; `docs/uat/phase-0.md`.
Acceptance tests (automate where marked [auto]):
- [auto] RLS: outsider cannot select any row of org "Mosley Ventures (dev)" in any Phase 0 table.
- [auto] RLS: operator cannot insert/update `memberships` or `settings`; owner can.
- [auto] `audit_log` gets a row for each insert/update/delete on `brands`, `memberships`, `settings`; UPDATE and DELETE on `audit_log` raise errors.
- [auto] `svc_drafts` and `svc_worker` can read zero rows from every table.
- [auto] Playwright: owner signs in (local magic link from mail catcher), is forced through MFA enrollment, sees both brands; brand-limited user sees only `369`.
- [manual] Chris and partner each sign in from their own PC against a local or preview build.
- [auto] CI passes; gitleaks finds nothing; `grep` test finds no `password` column outside `auth` schema.
Definition of done: all acceptance tests pass in CI; `supabase db reset` from scratch works; README explains local setup in ≤10 steps; PR opened to `main` with summary, screenshots, test output, and "Requesting review: Jack (Grok Bot)".

### Phase 1 — CRM, tasks, collaboration, intake (branch `phase-1-crm`)
Scope: companies, contacts, deals (kanban per brand pipeline, default stages New lead → Contacted → Discovery booked → Proposal sent → Won / Lost), activities timeline, tasks (assign, due, recurring rule stored), comments with @mentions, in-app notifications + daily digest via the `mailer` interface (`MAILER_DRIVER=local`), Realtime refresh on boards, public lead form `/f/[formId]` with honeypot + rate limit + consent checkbox writing `consents`, `events` emission for every domain action, `files` + Storage + import guard, contact CSV import (column mapping, dedupe by email/phone), `bookings` with a booking-link field only, cross-sell suggestion rules (create a **task** only), `docs/uat/phase-1.md`.
Acceptance tests:
- [auto] Form submit creates contact + deal + task + notification + `events` rows within 5 s; honeypot-filled submit is rejected; 11th submit in a minute from one IP is rate-limited.
- [auto] Ticking consent writes a `consents` row with `consent_text_version`; no consent → no row.
- [auto] @mention notifies only the mentioned user; a viewer cannot comment.
- [auto] Deal stage change writes an `activities` row, an `events` row and an `audit_log` row.
- [auto] Contact CSV whose headers match the test import-guard signature ≥80% is rejected and logged; a normal CSV imports with dedupe.
- [auto] Cross-sell rule (Offer A client with a street address) creates a task and no `outbox_messages` row.
- [auto] Brand-limited user cannot see FPD deals; outsider sees nothing.
- [auto] Code search: no HTTP calls to cal.com or any third-party API.
- [manual] Chris and partner move the same deal on two PCs and both boards update.
Definition of done: as Phase 0, plus RLS tests for every new table (allow + deny per role), and UAT script written.

### Phase 2 — Jobs, stage gates, checks, approvals, outbox (branch `phase-2-jobs-gates`)
Scope: client_accounts, jobs board by stage, job page tabs (Overview, Intake, Audit, Drafts, Review, Delivery, Activity), intake checklist, manual audit entry + findings, drafts with versions and word-level `DiffViewer` (before = job item source / previous version), checks engine + rule seeds + settings page for rules, review queue, approvals with two-person rule, `StageGateBar` showing each gate and its blockers, outbox page with manual release (marks sent; no provider), deliverables placeholder, `transition_job`, `approve_subject`, `release_outbox`, `docs/uat/phase-2.md`.
Acceptance tests:
- [auto] Direct `update jobs set stage=...` fails for every role; `transition_job` succeeds only when its gate passes; one failing test per gate G1–G6 asserting the error names the gate.
- [auto] Inserting a new draft version on an `approved` job marks old approvals stale and moves the job to `drafts` with reason `content_changed_after_approval`.
- [auto] With `two_person_rule` on, the author of the current version cannot approve it; the other human can.
- [auto] Every must-fail fixture in §G produces a blocker; drafts with blockers cannot pass G3; an owner override with reason lets G3 pass and is audited.
- [auto] `release_outbox` refuses when the outbox hash ≠ approved hash, when the approval is stale, or when the user lacks `outbox.release`.
- [auto] TypeScript `canonicalHash` equals SQL `canonical_hash` for 20 random fixtures.
- [auto] Playwright two-user flow: partner writes drafts for the Bluebonnet job → checks pass → Chris approves → job reaches `approved` → Chris edits one bullet → job falls back to `drafts`.
- [manual] Run the Trinity Paws Offer B job end to end with hand-written drafts and a manual outbox release.
Definition of done: as Phase 1, plus every gate and function has database tests, and `docs/adr/0001-stage-gates.md` explains the design.

## J. Hooks later phases rely on (must exist after Phase 2)
`org_id` + `brand_id` everywhere; `api_tokens` and `svc_drafts`/`svc_worker` roles; `events` emitted by all actions; `consents` from forms; `files` + import guard; `draft_versions.author_kind` accepting `ai` and `jack` and `ai_run_id` column; checks engine running on every version insert; outbox status machine with a pluggable sender interface (`OutboxSender` with only a `manual` implementation now); `mailer` interface with `local` driver; `DEPLOY_MODE` read in config. Do **not** build AI, Jack endpoints, Ollama worker, Resend/Twilio/Stripe/Google connectors, portal, or booking UI in this session.

## K. Pull request rules
- One PR per phase from its branch to `main`: `gh pr create --base main --head phase-N-... --title "Phase N: ..." --body-file .github/pr-body.md`.
- PR body: scope delivered, acceptance checklist with each box ticked or explained, test output summary, screenshots, migration list, security notes (new tables + their RLS), anything deferred, and the line "Requesting review: Jack (Grok Bot) — Chris will ask Jack to review this PR."
- Never merge, force-push to `main`, or skip CI. If CI fails, fix on the branch.
- Start Phase N+1 from `main` only after Chris says the previous PR is merged; if he wants to keep moving, branch from the previous phase branch and say so in the PR.

## L. How to report back at the end of each phase
List: what was built, files/migrations added, test results, the PR link, anything you could not finish and why, and any decision you need from Chris (cite the decision IDs in `docs/BUILD_PLAN.md` §11).
