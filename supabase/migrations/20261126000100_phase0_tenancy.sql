-- Phase 0: tenancy, people, roles, permissions, settings, service tokens.
-- BUILD_PLAN §3.1, §3.2 (Tenancy & people), kickoff §E (Phase 0).
--
-- Conventions for every org-scoped table:
--   id uuid pk, org_id uuid not null, created_at, updated_at, created_by.
-- Exceptions (documented in docs/adr/0002-tenancy-and-rls.md):
--   orgs           is the tenant root (its id is the org id).
--   profiles       is per user, across orgs (keyed by auth user id).
--   role_permissions is global seed data shared by every org.

-- ---------------------------------------------------------------------------
-- Generic row helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Fills created_by from the signed-in user when the caller did not set it.
create or replace function public.set_created_by()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid
);
comment on table public.orgs is 'Tenant root. v1 has one org; the schema is multi-tenant-ready.';

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9][a-z0-9_-]{0,31}$'),
  name text not null check (length(trim(name)) > 0),
  from_email text,
  legal_footer text,
  report_theme jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid,
  unique (org_id, key),
  unique (org_id, id)
);
create index brands_org_id_idx on public.brands (org_id);

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
comment on table public.profiles is 'One row per auth user, created by trigger on auth.users.';

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'operator', 'reviewer', 'viewer', 'client')),
  brand_ids uuid[],  -- null = all brands in the org
  status text not null default 'invited' check (status in ('active', 'invited', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid,
  unique (org_id, user_id)
);
create index memberships_user_id_idx on public.memberships (user_id);
create index memberships_org_id_idx on public.memberships (org_id);

create table public.role_permissions (
  role text not null check (role in ('owner', 'admin', 'operator', 'reviewer', 'viewer', 'client')),
  permission text not null,
  created_at timestamptz not null default now(),
  primary key (role, permission)
);
comment on table public.role_permissions is 'Global permission matrix (BUILD_PLAN §3.1). Seeded; read-only to app users.';

create table public.settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_.]{1,64}$'),
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid,
  unique (org_id, key)
);
create index settings_org_id_idx on public.settings (org_id);

create table public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('service:drafts', 'service:worker')),
  token_hash text not null unique,
  scopes text[] not null default '{}',
  allowed_brand_ids uuid[],
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  created_by uuid,
  check (expires_at <= created_at + interval '90 days')
);
comment on table public.api_tokens is 'Service tokens for Jack (service:drafts) and the local AI worker (service:worker). Table only in Phase 0; endpoints arrive in Phase 3.';
create index api_tokens_org_id_idx on public.api_tokens (org_id);

-- ---------------------------------------------------------------------------
-- Row triggers: updated_at and created_by
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['orgs', 'brands', 'profiles', 'memberships', 'settings', 'api_tokens'] loop
    execute format(
      'create trigger %1$s_set_updated_at before update on public.%1$I
         for each row execute function public.set_updated_at()', t);
  end loop;
  foreach t in array array['orgs', 'brands', 'memberships', 'settings', 'api_tokens'] loop
    execute format(
      'create trigger %1$s_set_created_by before insert on public.%1$I
         for each row execute function public.set_created_by()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Seeded permission matrix (BUILD_PLAN §3.1 mapped to kickoff §E names)
-- ---------------------------------------------------------------------------
-- operator approve/release are granted by org settings
-- (operator_can_approve, operator_can_release), see has_perm().

insert into public.role_permissions (role, permission) values
  ('owner', 'org.manage'), ('owner', 'members.manage'), ('owner', 'crm.read'), ('owner', 'crm.write'),
  ('owner', 'jobs.write'), ('owner', 'jobs.transition'), ('owner', 'drafts.write'), ('owner', 'drafts.approve'),
  ('owner', 'outbox.release'), ('owner', 'checks.manage'), ('owner', 'checks.override'), ('owner', 'audit.read'),
  ('owner', 'settings.manage'),
  -- admin: everything except org.manage (billing / org ownership)
  ('admin', 'members.manage'), ('admin', 'crm.read'), ('admin', 'crm.write'), ('admin', 'jobs.write'),
  ('admin', 'jobs.transition'), ('admin', 'drafts.write'), ('admin', 'drafts.approve'), ('admin', 'outbox.release'),
  ('admin', 'checks.manage'), ('admin', 'checks.override'), ('admin', 'audit.read'), ('admin', 'settings.manage'),
  -- operator: day-to-day work; sees only own audit rows
  ('operator', 'crm.read'), ('operator', 'crm.write'), ('operator', 'jobs.write'), ('operator', 'jobs.transition'),
  ('operator', 'drafts.write'), ('operator', 'audit.read'),
  -- reviewer: reads CRM, approves drafts
  ('reviewer', 'crm.read'), ('reviewer', 'drafts.approve'),
  -- viewer: read only
  ('viewer', 'crm.read');
  -- client: no internal permissions (portal arrives in Phase 7)

-- ---------------------------------------------------------------------------
-- Default settings for every new org
-- ---------------------------------------------------------------------------

create or replace function public.org_default_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.settings (org_id, key, value, created_by) values
    (new.id, 'two_person_rule', 'true'::jsonb, new.created_by),
    (new.id, 'operator_can_approve', 'true'::jsonb, new.created_by),
    (new.id, 'operator_can_release', 'false'::jsonb, new.created_by)
  on conflict (org_id, key) do nothing;
  return new;
end;
$$;

create trigger orgs_default_settings after insert on public.orgs
  for each row execute function public.org_default_settings();

-- ---------------------------------------------------------------------------
-- Profiles follow auth.users
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Membership guards
-- ---------------------------------------------------------------------------
-- Only an owner can create, change or remove an owner membership, and the
-- last active owner of an org cannot be demoted, disabled or removed.

create or replace function public.guard_membership_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := coalesce(new.org_id, old.org_id);
  v_touches_owner boolean :=
    (tg_op in ('UPDATE', 'DELETE') and old.role = 'owner')
    or (tg_op in ('INSERT', 'UPDATE') and new.role = 'owner');
  v_remaining int;
begin
  -- auth.uid() is null for migrations, seed and server jobs using the service role.
  if v_touches_owner and auth.uid() is not null and not public.has_perm(v_org, 'org.manage') then
    raise exception 'Only an owner can grant, change or remove the owner role'
      using errcode = '42501';
  end if;

  if tg_op in ('UPDATE', 'DELETE') and old.role = 'owner' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role <> 'owner' or new.status <> 'active')
     -- Deleting the whole org cascades here; that is allowed.
     and exists (select 1 from public.orgs where id = old.org_id) then
    select count(*) into v_remaining
    from public.memberships
    where org_id = old.org_id and role = 'owner' and status = 'active' and id <> old.id;
    if v_remaining = 0 then
      raise exception 'An org must keep at least one active owner' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger memberships_guard before insert or update or delete on public.memberships
  for each row execute function public.guard_membership_change();

-- ---------------------------------------------------------------------------
-- Restricted service roles for Jack and the local worker.
-- No grants in Phases 0-2; Phase 3 adds narrow grants.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'svc_drafts') then
    create role svc_drafts nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'svc_worker') then
    create role svc_worker nologin noinherit;
  end if;
end;
$$;
-- Lets the migration owner act as these roles in database tests (SET ROLE).
-- Grants no data access by itself.
grant svc_drafts, svc_worker to postgres;
