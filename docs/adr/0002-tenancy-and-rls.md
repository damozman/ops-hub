# ADR 0002: Tenancy, roles and row-level security

Date: 2026-11-26 · Status: accepted · Phase 0

## Decision

- **`orgs` is the tenant root.** Every org-scoped table has `org_id not null`; brand-scoped tables add `brand_id`.
  Exceptions: `orgs` (its `id` is the org), `profiles` (one per auth user, across orgs) and `role_permissions`
  (global seed data). `audit_log.org_id` is null only for rows about those global tables.
- **Permissions are data.** `role_permissions` holds the matrix from BUILD_PLAN §3.1. Two org settings widen the
  operator role: `operator_can_approve` (default on) and `operator_can_release` (default off).
- **RLS on every table, default deny.** Helper functions (`auth_org_ids`, `auth_role`, `has_perm`, `can_brand`) are
  `security definer` and only describe the caller. Grants are explicit (`auto_expose_new_tables=false` locally, and
  migrations revoke everything first so hosted projects behave the same). `anon` has nothing.
- **MFA is enforced in the database too.** A membership with role owner/admin/operator only counts when the JWT has
  `aal=aal2`. An owner session that skipped MFA reads zero rows, even if the app check were bypassed.
- **The client role sees nothing internal** in Phases 0-2. Portal access arrives in Phase 7.
- **Owner safety.** Only an owner can grant, change or remove the owner role, and the last active owner can't be
  demoted, disabled or removed (trigger `guard_membership_change`).
- **Audit log is append-only.** Row triggers write before/after images for every core table; `UPDATE`, `DELETE`
  and `TRUNCATE` are revoked and blocked by trigger, for every role including the service role. `token_hash` is
  stripped from audit rows.
- **Service roles.** `svc_drafts` (Jack) and `svc_worker` (local AI worker) exist with no grants. Phase 3 adds narrow
  grants; tests assert they can read nothing today.
- **Service-role key** is used only to create/look up auth users when inviting, after the caller's
  `members.manage` permission is checked as that user. The membership row itself is written as the user, under RLS.

## Consequences

Adding a table means: RLS on, explicit grants, policies, an audit trigger, and allow/deny tests per role. Test
`03_service_roles_and_grants` fails if any public table lacks RLS or a policy.
