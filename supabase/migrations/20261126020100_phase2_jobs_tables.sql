-- Phase 2: jobs, stage gates, checks, approvals, outbox. Tables only.
-- BUILD_PLAN §3.2-§3.5, §4.4; kickoff §E (Phase 2), §F, §G.
-- Every table: id, org_id, created_at, updated_at, created_by. Every job child carries
-- brand_id (copied from its job by trigger) so RLS can use can_brand() directly.

-- Jobs read access is its own permission (internal roles only; client has none).
insert into public.role_permissions (role, permission) values
  ('owner', 'jobs.read'), ('admin', 'jobs.read'), ('operator', 'jobs.read'), ('reviewer', 'jobs.read'), ('viewer', 'jobs.read')
on conflict do nothing;

create table public.client_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  brand_id uuid not null,
  company_id uuid not null,
  status text not null default 'active' check (status in ('active', 'paused', 'closed')),
  data_sensitivity text not null default 'public_only' check (data_sensitivity in ('public_only', 'client_confidential')),
  ai_policy text not null default 'default' check (ai_policy in ('default', 'local_only')),
  portal_enabled boolean not null default false,
  primary_contact_id uuid references public.contacts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid,
  unique (org_id, id),
  unique (org_id, brand_id, company_id),
  foreign key (org_id, brand_id) references public.brands (org_id, id),
  foreign key (company_id) references public.companies (id)
);
create index client_accounts_org_idx on public.client_accounts (org_id, brand_id);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  brand_id uuid not null,
  client_account_id uuid not null,
  offer text not null check (offer in ('A', 'B')),
  title text not null check (length(trim(title)) > 0),
  stage text not null default 'intake'
    check (stage in ('intake', 'audit', 'drafts', 'review', 'approved', 'delivered', 'upkeep', 'closed', 'cancelled')),
  assignee_user_id uuid references auth.users (id) on delete set null,
  reviewer_user_id uuid references auth.users (id) on delete set null,
  due_at timestamptz,
  scope jsonb not null default '{}'::jsonb,
  requires_client_approval boolean not null default false,
  contract_ref text,
  subscription_active boolean not null default false,
  stage_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid,
  unique (org_id, id),
  foreign key (org_id, brand_id) references public.brands (org_id, id),
  foreign key (org_id, client_account_id) references public.client_accounts (org_id, id)
);
create index jobs_org_stage_idx on public.jobs (org_id, brand_id, stage);
comment on column public.jobs.stage is 'Changed only by transition_job() (and the draft-version trigger). Direct UPDATE is revoked and guarded.';

-- Append-only log of every stage change.
create table public.job_stage_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  brand_id uuid not null,
  job_id uuid not null references public.jobs (id) on delete cascade,
  from_stage text not null,
  to_stage text not null,
  actor_id uuid,
  actor_kind text not null default 'user' check (actor_kind in ('user', 'system', 'service')),
  reason text,
  gate_results jsonb not null default '[]'::jsonb,
  at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid
);
create index job_stage_events_job_idx on public.job_stage_events (job_id, at desc);

-- Checklists: items [{key,label,done,done_by,done_at,evidence}]. Changed only through set_checklist_item().
create table public.intake_checklists (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  brand_id uuid not null,
  job_id uuid not null unique references public.jobs (id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid
);

-- G5 delivery checklist (backup taken, client notified). Same shape as intake.
create table public.delivery_checklists (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  brand_id uuid not null,
  job_id uuid not null unique references public.jobs (id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid
);

create table public.job_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  brand_id uuid not null,
  job_id uuid not null references public.jobs (id) on delete cascade,
  kind text not null check (kind in ('listing', 'location', 'asset')),
  marketplace text not null default 'other' check (marketplace in ('amazon', 'walmart', 'shopify', 'gbp', 'openai_feed', 'other')),
  external_ref text,
  title text not null check (length(trim(title)) > 0),
  status text not null default 'open' check (status in ('open', 'done', 'skipped')),
  source_data jsonb not null default '{}'::jsonb,  -- current live content / client answers (spec fidelity source)
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid,
  unique (org_id, id)
);
create index job_items_job_idx on public.job_items (job_id);

create table public.audits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  brand_id uuid not null,
  job_id uuid not null references public.jobs (id) on delete cascade,
  engine text not null default 'manual' check (engine in ('listing', 'local', 'manual')),
  rules_version text,
  status text not null default 'running' check (status in ('running', 'finished', 'failed')),
  score numeric check (score is null or (score >= 0 and score <= 100)),
  summary jsonb not null default '{}'::jsonb,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid
);
create index audits_job_idx on public.audits (job_id, created_at desc);

create table public.audit_findings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  brand_id uuid not null,
  audit_id uuid not null references public.audits (id) on delete cascade,
  job_item_id uuid references public.job_items (id) on delete set null,
  rule_key text not null default 'manual',
  severity text not null check (severity in ('blocker', 'major', 'minor', 'info')),
  field text,
  message text not null check (length(trim(message)) > 0),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid
);
create index audit_findings_audit_idx on public.audit_findings (audit_id);

create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  brand_id uuid not null,
  job_id uuid not null references public.jobs (id) on delete cascade,
  job_item_id uuid references public.job_items (id) on delete set null,
  kind text not null check (kind in ('listing', 'gbp_description', 'gbp_post', 'review_reply', 'review_request', 'sms', 'email', 'other')),
  title text,
  in_scope boolean not null default true,
  status text not null default 'draft'
    check (status in ('draft', 'checks_failed', 'ready_for_review', 'changes_requested', 'approved', 'superseded', 'delivered')),
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid
);
create index drafts_job_idx on public.drafts (job_id);
comment on column public.drafts.status is 'Set by the version trigger, record_check_run(), approve_subject() and transition_job() only.';

-- Immutable (no UPDATE/DELETE). content_hash = canonical_hash(content), set by trigger.
create table public.draft_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  brand_id uuid not null,
  draft_id uuid not null references public.drafts (id) on delete cascade,
  version int not null default 0,  -- numbered by trigger
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  content_hash text not null default '',  -- set (or verified) by trigger
  author_kind text not null default 'user' check (author_kind in ('user', 'ai', 'jack')),
  author_id uuid,
  ai_run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid,
  unique (draft_id, version)
);
alter table public.drafts
  add constraint drafts_current_version_fk foreign key (current_version_id) references public.draft_versions (id) on delete set null;

-- Rules as data. org_id null = global default; an org row with the same rule_key overrides it.
create table public.check_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.orgs (id) on delete cascade,
  rule_key text not null check (rule_key ~ '^[a-z0-9_.]{1,64}$'),
  pack text not null,
  title text not null,
  severity text not null check (severity in ('blocker', 'warning', 'info')),
  params jsonb not null default '{}'::jsonb,
  version int not null default 1 check (version > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid
);
create unique index check_rules_global_uq on public.check_rules (rule_key) where org_id is null;
create unique index check_rules_org_uq on public.check_rules (org_id, rule_key) where org_id is not null;

create table public.check_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  brand_id uuid not null,
  draft_version_id uuid not null references public.draft_versions (id) on delete cascade,
  rules_version text not null,
  passed boolean not null,
  blocker_count int not null default 0,
  warning_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid
);
create index check_runs_version_idx on public.check_runs (draft_version_id, created_at desc);

create table public.check_results (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  brand_id uuid not null,
  check_run_id uuid not null references public.check_runs (id) on delete cascade,
  rule_key text not null,
  severity text not null check (severity in ('blocker', 'warning', 'info')),
  message text not null,
  span jsonb,
  override_by uuid,
  override_reason text,
  override_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid,
  check ((override_by is null) = (override_reason is null))
);
create index check_results_run_idx on public.check_results (check_run_id);

-- Append-only except `stale`, which only the triggers set. Inserted only by approve_subject().
create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  brand_id uuid not null,
  job_id uuid references public.jobs (id) on delete cascade,
  subject_type text not null check (subject_type in ('draft_version', 'bundle', 'outbox_message', 'deliverable')),
  subject_id uuid not null,
  content_hash text not null,
  approver_id uuid not null,
  approver_role text not null,
  kind text not null default 'internal' check (kind in ('internal', 'client')),
  decision text not null check (decision in ('approved', 'rejected', 'changes_requested')),
  stale boolean not null default false,
  comment text,
  decided_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid
);
create index approvals_subject_idx on public.approvals (subject_type, subject_id, decided_at desc);
create index approvals_job_idx on public.approvals (job_id);

create table public.outbox_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  brand_id uuid not null,
  job_id uuid references public.jobs (id) on delete set null,
  channel text not null check (channel in ('email', 'sms', 'gbp_post', 'gbp_reply', 'listing_push', 'manual')),
  recipient text,
  subject text,
  body text not null default '',
  payload jsonb not null default '{}'::jsonb,
  content_hash text not null default '',  -- always computed by trigger
  approval_id uuid references public.approvals (id) on delete set null,
  status text not null default 'pending_approval'
    check (status in ('pending_approval', 'approved', 'queued', 'sent', 'failed', 'blocked', 'cancelled')),
  block_reason text,
  scheduled_for timestamptz,
  sent_at timestamptz,
  sent_by uuid,
  provider_id text,
  last_edited_by uuid,  -- two-person rule: the approver must differ from the last editor
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid,
  foreign key (org_id, brand_id) references public.brands (org_id, id)
);
create index outbox_org_status_idx on public.outbox_messages (org_id, status, created_at desc);
create index outbox_job_idx on public.outbox_messages (job_id);
comment on column public.outbox_messages.status is 'approved only via approve_subject(), sent only via release_outbox(), cancelled via cancel_outbox().';

-- Placeholder rows; exports arrive in Phase 4.
create table public.deliverables (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  brand_id uuid not null,
  job_id uuid not null references public.jobs (id) on delete cascade,
  kind text not null check (length(trim(kind)) > 0),
  file_id uuid references public.files (id) on delete set null,
  status text not null default 'planned' check (status in ('planned', 'ready', 'delivered')),
  approval_id uuid references public.approvals (id) on delete set null,
  delivered_at timestamptz,
  delivered_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid
);
create index deliverables_job_idx on public.deliverables (job_id);

-- ---------------------------------------------------------------------------
-- Standard row triggers (updated_at, created_by, audit_log)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['client_accounts', 'jobs', 'job_stage_events', 'intake_checklists', 'delivery_checklists',
    'job_items', 'audits', 'audit_findings', 'drafts', 'draft_versions', 'check_rules', 'check_runs', 'check_results',
    'approvals', 'outbox_messages', 'deliverables'] loop
    execute format('create trigger %1$s_set_updated_at before update on public.%1$I for each row execute function public.set_updated_at()', t);
    execute format('create trigger %1$s_set_created_by before insert on public.%1$I for each row execute function public.set_created_by()', t);
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$I for each row execute function public.audit_row()', t);
  end loop;
end;
$$;

-- Append-only logs (rows go only with their org).
create trigger job_stage_events_append_only before update or delete on public.job_stage_events
  for each row execute function public.block_mutation_unless_org_deleted();
