# ADR 0001: Job stages, gates and approvals live in Postgres

Date: 2026-11-26 · Status: accepted · Phase 2

## Decision

- **One way to change a job's stage:** `transition_job(job, to, reason, override)`, a `security definer` function.
  `jobs.stage` has no update grant for any API role, and a guard trigger refuses direct writes, so the board, the
  server actions and any future API all go through the same checks.
- **Gates are SQL.** `evaluate_gate(job, gate)` returns `{gate, label, passed, blockers[]}` and `job_gates(job)`
  returns all of them for the UI's StageGateBar. Forward moves map to a gate (`job_move_kind`):
  - G1 intake → audit: every intake checklist item done.
  - G2 audit → drafts: at least one finished audit.
  - G3 drafts → review: every in-scope draft has a current version whose checks pass (or whose blockers were each
    overridden with a reason by someone holding `checks.override`).
  - G4 review → approved: every in-scope draft's current version has a non-stale approval.
  - G5 approved → delivered: delivery checklist done and at least one deliverable.
  - G6 delivered → upkeep/closed: outbox empty of unsent approved items. Only an owner may override G6, with a reason.
  - Backward moves need a reason; cancel is owner/admin only and needs a reason. Every move writes
    `job_stage_events` (append-only) and the audit log.
- **Draft versions are immutable and hashed.** `canonical_hash(content)` is sha256 of a canonical JSON form (keys
  sorted by UTF-8 bytes, no whitespace, numbers trimmed like `numeric`). The TypeScript mirror in
  `src/lib/canonical-hash.ts` is cross-checked against SQL in e2e. A new version becomes current, resets the draft to
  `draft`, marks earlier approvals stale, and moves an approved job back to drafts.
- **Approvals bind to a hash.** `approve_subject` records the approver, role, time and content hash. Two-person rule:
  the author or last human editor of a version, or the creator/last editor of an outbox item, can't approve it.
- **Release is manual.** `release_outbox` requires `outbox.release`, an approved item, and that the stored content
  hash still matches the approval (checked before staleness). It marks the item sent with `provider_id = 'manual'`.
  The app sends nothing in Phases 0-2; `OutboxSender` is the seam for real providers later.
- **Checks are data.** Rules live in `check_rules` (global rows, org overrides by `rule_key`), are run in the app
  by a pure engine, and are recorded by `record_check_run`, which only the service role can call. Each run stores a
  `rules_version` fingerprint of the effective rule set.

## Consequences

The UI can't drift from the rules: it renders whatever `job_gates` says and shows the database's error message when
a move is refused. Adding a gate condition is a migration plus pgTAP tests in `09_jobs_gates`.
