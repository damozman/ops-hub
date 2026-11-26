# ADR 0001: Job stages, gates and approvals live in Postgres

Date: 2026-11-26 · Status: accepted · Phase 2

## Decision

- **One way to change a job's stage:** `transition_job(job, to, reason, override)`, a `security definer` function.
  `jobs.stage` has no update grant for any API role, and a guard trigger refuses direct writes, so the board, the
  server actions and any future API all go through the same checks.
- **Gates are SQL.** `evaluate_gate(job, gate)` returns `{gate, label, passed, blockers[]}` and `job_gates(job)`
  returns all of them for the UI's StageGateBar. Forward moves map to a gate (`job_move_kind`):
  - **G1** intake → audit: every intake checklist item is done.
  - **G2** audit → drafts: the job's latest audit is `finished` and has a `rules_version` (manual audits record
    `manual-v1`). Findings are not required.
  - **G3** drafts → review: at least one in-scope draft, and every in-scope draft has a current version, checks have
    run on it, and its latest check run passed or each of its blockers was overridden with a reason by someone with
    `checks.override`.
  - **G4** review → approved: at least one in-scope draft, and for each one the latest non-stale internal approval of
    its current version is `approved`, its hash equals the current content hash, and (with the `two_person_rule`
    setting on, the default) the approver is neither the version's author nor the draft's last human editor. If the
    job has `requires_client_approval`, a non-stale client approval of the bundle (`job_bundle_hash`) is also
    required; clients can't record one until the portal (Phase 7), so such a job stops here.
  - **G5** approved → delivered: G4 still passes (its blockers are repeated with an "Approval:" prefix), every
    delivery checklist item is done (backup taken, deliverables uploaded, client notified), and every outbox item for
    the job is `sent` or `cancelled`.
  - **G6** delivered → upkeep: `subscription_active` is set. Only the owner can override a failed G6, with a reason,
    which is stored in the stage event.
  - Other moves: review/approved → drafts (needs a reason), upkeep → audit (re-audit), delivered/upkeep → closed (no
    gate), and cancel from any open stage (owner or admin, with a reason). Every move writes `job_stage_events`
    (append-only) and the audit log.
- **Gate inputs that only the right people can change.** `subscription_active` (owner) and
  `requires_client_approval` (owner or admin) are not grantable columns; they change only through
  `set_job_flags(job, subscription_active, requires_client_approval, reason)`, which needs a reason and emits
  `job.flags_changed`. The assignee and reviewer must be active internal members with the job's brand, and the
  reviewer needs `drafts.approve`.
- **Draft versions are immutable and hashed.** `canonical_hash(content)` is sha256 of a canonical JSON form (keys
  sorted by UTF-8 bytes, no whitespace, numbers trimmed like `numeric`). The TypeScript mirror in
  `src/lib/canonical-hash.ts` is cross-checked against SQL in e2e. A new version becomes current, resets the draft to
  `draft`, marks earlier approvals stale, and moves an approved job back to drafts
  (`content_changed_after_approval`).
- **Scope is part of what was approved.** A draft's `kind` and `job_item_id` can't change once it has content (make a
  new draft). Changing `in_scope` on an approved job marks the bundle approval stale and moves the job back to drafts
  (`scope_changed_after_approval`); after delivery, scope is frozen.
- **Approvals bind to a hash.** `approve_subject` records the approver, role, time and content hash. Two-person rule:
  the author or last human editor of a version, or the creator/last editor of an outbox item, can't approve it. A
  version whose latest check run has warnings is approved only with `p_ack_warnings`, stored as
  `approvals.warnings_acknowledged`.
- **Release is manual.** `release_outbox` requires `outbox.release`, an approved item, and that the stored content
  hash still matches the approval (checked before staleness). It marks the item sent with `provider_id = 'manual'`.
  The app sends nothing in Phases 0-2; `OutboxSender` is the seam for real providers later.
- **Checks are data.** Rules live in `check_rules` (global rows, org overrides by `rule_key`), are run in the app
  by a pure engine, and are recorded by `record_check_run`, which only the service role can call. Each run stores a
  `rules_version` fingerprint of the effective rule set.

## Consequences

The UI can't drift from the rules: it renders whatever `job_gates` says and shows the database's error message when
a move is refused. Adding a gate condition is a migration plus pgTAP tests (`09_jobs_gates`,
`10_phase2_review_fixes`).
