-- Phase 1: CRM, tasks, collaboration, intake. Tables only.
-- BUILD_PLAN §3.2 (CRM), §4.1; kickoff §E (Phase 1).
-- Every table: id, org_id, created_at, updated_at, created_by. Brand-scoped tables add brand_id.

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  website text,
  industry text,
  street_address text,
  city text,
  state text,
  sells_online boolean not null default false,
  brand_ids uuid[],  -- null = relevant to every brand
  lifecycle text not null default 'lead' check (lifecycle in ('lead', 'prospect', 'client', 'churned')),
  source text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid
);
create index companies_org_idx on public.companies (org_id);
create index companies_name_idx on public.companies (org_id, lower(name));

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,
  first_name text,
  last_name text,
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone_e164 text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  title text,
  owner_user_id uuid references auth.users (id) on delete set null,
  tags text[] not null default '{}',
  do_not_contact boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid,
  check (coalesce(first_name, last_name, email, phone_e164) is not null)
);
create index contacts_org_idx on public.contacts (org_id);
create index contacts_company_idx on public.contacts (company_id);
create unique index contacts_org_email_uq on public.contacts (org_id, lower(email)) where email is not null;
create index contacts_org_phone_idx on public.contacts (org_id, phone_e164);

-- Append-only consent evidence (TCPA / CAN-SPAM groundwork for Phase 6).
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  email text,
  phone_e164 text,
  channel text not null check (channel in ('sms', 'email')),
  purpose text not null check (purpose in ('marketing', 'transactional', 'review_request')),
  status text not null check (status in ('granted', 'revoked')),
  method text not null,
  consent_text_version text,
  evidence jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid,
  check (coalesce(contact_id::text, email, phone_e164) is not null)
);
create index consents_org_idx on public.consents (org_id);
create index consents_contact_idx on public.consents (contact_id);

create table public.pipelines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  brand_id uuid not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid,
  foreign key (org_id, brand_id) references public.brands (org_id, id) on delete cascade
);
create index pipelines_brand_idx on public.pipelines (org_id, brand_id);

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  pipeline_id uuid not null references public.pipelines (id) on delete cascade,
  name text not null,
  position int not null,
  win_probability numeric not null default 0 check (win_probability between 0 and 1),
  outcome text not null default 'open' check (outcome in ('open', 'won', 'lost')),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid,
  unique (pipeline_id, position)
);
create index pipeline_stages_pipeline_idx on public.pipeline_stages (pipeline_id);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  brand_id uuid not null,
  company_id uuid references public.companies (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete set null,
  pipeline_id uuid not null references public.pipelines (id),
  stage_id uuid not null references public.pipeline_stages (id),
  title text not null,
  value_cents bigint not null default 0 check (value_cents >= 0),
  offer text not null default 'other' check (offer in ('A', 'B', 'other')),
  expected_close date,
  owner_user_id uuid references auth.users (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'won', 'lost')),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid,
  foreign key (org_id, brand_id) references public.brands (org_id, id) on delete cascade
);
create index deals_org_brand_idx on public.deals (org_id, brand_id);
create index deals_stage_idx on public.deals (stage_id);
create index deals_company_idx on public.deals (company_id);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  subject_type text not null check (subject_type in ('company', 'contact', 'deal', 'task')),
  subject_id uuid not null,
  kind text not null check (kind in ('note', 'call', 'email_logged', 'meeting', 'stage_change', 'system')),
  body text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid
);
create index activities_subject_idx on public.activities (org_id, subject_type, subject_id, occurred_at desc);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  brand_id uuid,
  title text not null check (length(trim(title)) > 0),
  body text,
  assignee_user_id uuid references auth.users (id) on delete set null,
  due_at timestamptz,
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  subject_type text check (subject_type in ('company', 'contact', 'deal')),
  subject_id uuid,
  recurring_rule text,   -- stored only in Phase 1 (e.g. RRULE:FREQ=MONTHLY)
  dedupe_key text,       -- prevents duplicate system suggestions (cross-sell)
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid,
  foreign key (org_id, brand_id) references public.brands (org_id, id) on delete cascade
);
create index tasks_assignee_idx on public.tasks (org_id, assignee_user_id, status);
create index tasks_subject_idx on public.tasks (subject_type, subject_id);
create unique index tasks_dedupe_uq on public.tasks (org_id, dedupe_key) where dedupe_key is not null and status = 'open';

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  subject_type text not null check (subject_type in ('company', 'contact', 'deal', 'task')),
  subject_id uuid not null,
  body_md text not null check (length(body_md) between 1 and 10000),
  mentions uuid[] not null default '{}',
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid
);
create index comments_subject_idx on public.comments (org_id, subject_type, subject_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  subject_type text,
  subject_id uuid,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  digested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid
);
create index notifications_user_idx on public.notifications (user_id, read_at, created_at desc);

-- Domain events (append-only). Consumed by notifications now, workflows in Phase 6.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  type text not null,
  subject_type text,
  subject_id uuid,
  payload jsonb not null default '{}'::jsonb,
  actor_id uuid,
  at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid
);
create index events_org_at_idx on public.events (org_id, at desc);
create index events_type_idx on public.events (org_id, type);

create table public.forms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  brand_id uuid not null,
  name text not null,
  schema jsonb not null default '{"fields":["first_name","last_name","email","phone","company","message"]}'::jsonb,
  consent_text text,
  consent_text_version text,
  redirect_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid,
  foreign key (org_id, brand_id) references public.brands (org_id, id) on delete cascade,
  check (consent_text is null or consent_text_version is not null)
);
create index forms_org_idx on public.forms (org_id);

create table public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  form_id uuid not null references public.forms (id) on delete cascade,
  data jsonb not null,
  ip_hash text,
  contact_id uuid references public.contacts (id) on delete set null,
  deal_id uuid references public.deals (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid
);
create index form_submissions_rate_idx on public.form_submissions (ip_hash, created_at desc);
create index form_submissions_form_idx on public.form_submissions (form_id, created_at desc);

-- Phase 1 stores a booking link / note only. Cal.com is never called or configured (Decision D4).
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  brand_id uuid,
  source text not null default 'link' check (source in ('native', 'calcom', 'link')),
  external_id text,
  contact_id uuid references public.contacts (id) on delete set null,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled', 'no_show')),
  booking_url text check (booking_url is null or booking_url ~* '^https://'),
  notes text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid,
  foreign key (org_id, brand_id) references public.brands (org_id, id) on delete cascade
);
create index bookings_contact_idx on public.bookings (contact_id);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  bucket text not null default 'org-files',
  path text not null,
  mime text,
  size bigint check (size >= 0),
  sha256 text,
  kind text not null default 'upload',
  sensitivity text not null default 'internal' check (sensitivity in ('public', 'internal', 'client_confidential')),
  uploaded_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid,
  unique (bucket, path),
  check (path like org_id::text || '/%')
);
create index files_org_idx on public.files (org_id);

-- Header signatures of templates that must never enter this app (BUILD_PLAN §5.6).
create table public.import_guard_signatures (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  label text not null,
  header_signature text[] not null check (cardinality(header_signature) > 0),
  threshold numeric not null default 0.8 check (threshold > 0 and threshold <= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid
);
create index import_guard_org_idx on public.import_guard_signatures (org_id);

-- Standard row triggers
do $$
declare
  t text;
begin
  foreach t in array array['companies', 'contacts', 'consents', 'pipelines', 'pipeline_stages', 'deals', 'activities',
    'tasks', 'comments', 'notifications', 'events', 'forms', 'form_submissions', 'bookings', 'files', 'import_guard_signatures'] loop
    execute format('create trigger %1$s_set_updated_at before update on public.%1$I for each row execute function public.set_updated_at()', t);
    execute format('create trigger %1$s_set_created_by before insert on public.%1$I for each row execute function public.set_created_by()', t);
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$I for each row execute function public.audit_row()', t);
  end loop;
end;
$$;

-- Append-only tables. Rows may only disappear when their whole org is deleted (cascade).
create or replace function public.block_mutation_unless_org_deleted()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.orgs where id = old.org_id) then
    return old;
  end if;
  raise exception '% is append-only: % is not allowed', tg_table_name, tg_op using errcode = '42501';
end;
$$;

create trigger consents_append_only before update or delete on public.consents
  for each row execute function public.block_mutation_unless_org_deleted();
create trigger events_append_only before update or delete on public.events
  for each row execute function public.block_mutation_unless_org_deleted();

-- events is itself a log; auditing it would only duplicate rows.
drop trigger events_audit on public.events;
