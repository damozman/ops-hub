# Ops Hub: notes for Claude sessions

- Spec: `docs/BUILD_PLAN.md`. Phases 0-2 kickoff: `docs/CLAUDE_KICKOFF_PHASES_0-2.md`. Work one phase at a time.
- Next.js here is 16.x: read `node_modules/next/dist/docs/` before using an API you're unsure of (see AGENTS.md).
  `middleware` is `proxy.ts`; `cacheComponents` is off (docs/adr/0003).
- New table checklist: RLS on, explicit grants (nothing for anon), policies, `audit_row` trigger, pgTAP allow/deny
  tests per role. Then `npm run db:types`.
- Never merge PRs; Chris merges after Jack (Grok Bot) reviews. No real client data, keys or tokens anywhere.
- Repo is separate from `aafes-pim-pipeline`: never read, import or reference it.
