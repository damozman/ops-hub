-- Phase 0: RLS helper functions and the append-only audit log.
-- Kickoff §F (helpers, audit_row), BUILD_PLAN §5.1, §5.5, §5.11.

-- ---------------------------------------------------------------------------
-- MFA: roles that must sign in with TOTP (BUILD_PLAN §5.5)
-- ---------------------------------------------------------------------------

create or replace function public.role_requires_mfa(p_role text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_role in ('owner', 'admin', 'operator');
$$;

-- True when the current request's JWT is at assurance level aal2 (TOTP verified).
create or replace function public.auth_is_aal2()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

-- Lets the app decide whether to send the user to MFA enrollment/verification
-- before any app page. Only reveals facts about the caller's own memberships.
create or replace function public.auth_requires_mfa()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid()
      and m.status in ('active', 'invited')
      and public.role_requires_mfa(m.role)
  );
$$;

-- ---------------------------------------------------------------------------
-- Membership helpers. A membership only counts when it is active and, for roles
-- that require MFA, when the session has passed MFA. This makes the database
-- itself refuse internal data to an owner/admin/operator session at aal1.
-- ---------------------------------------------------------------------------

create or replace function public.auth_membership(p_org uuid)
returns public.memberships
language sql
stable
security definer
set search_path = public
as $$
  select m.*
  from public.memberships m
  where m.org_id = p_org
    and m.user_id = auth.uid()
    and m.status = 'active'
    and (not public.role_requires_mfa(m.role) or public.auth_is_aal2())
  limit 1;
$$;

-- Org ids where the current user is an active *internal* member.
-- The client role is excluded: portal access arrives in Phase 7.
create or replace function public.auth_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.org_id
  from public.memberships m
  where m.user_id = auth.uid()
    and m.status = 'active'
    and m.role <> 'client'
    and (not public.role_requires_mfa(m.role) or public.auth_is_aal2());
$$;

create or replace function public.auth_role(p_org uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select (public.auth_membership(p_org)).role;
$$;

create or replace function public.setting_bool(p_org uuid, p_key text, p_default boolean)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select case jsonb_typeof(s.value) when 'boolean' then (s.value)::text::boolean else null end
       from public.settings s where s.org_id = p_org and s.key = p_key),
    p_default);
$$;

create or replace function public.has_perm(p_org uuid, p_perm text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := public.auth_role(p_org);
begin
  if v_role is null or v_role = 'client' then
    return false;
  end if;
  if exists (select 1 from public.role_permissions rp where rp.role = v_role and rp.permission = p_perm) then
    return true;
  end if;
  -- Org-level overrides for operators (kickoff §E settings).
  if v_role = 'operator' and p_perm = 'drafts.approve' then
    return public.setting_bool(p_org, 'operator_can_approve', true);
  end if;
  if v_role = 'operator' and p_perm = 'outbox.release' then
    return public.setting_bool(p_org, 'operator_can_release', false);
  end if;
  return false;
end;
$$;

-- True when the member's brand list is null (all brands) or contains the brand.
create or replace function public.can_brand(p_org uuid, p_brand uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select m.brand_ids is null or p_brand = any (m.brand_ids)
       from public.auth_membership(p_org) m
      where m.id is not null),
    false);
$$;

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.orgs (id) on delete set null,  -- null only for global tables (profiles, role_permissions)
  actor_id uuid,
  actor_kind text not null check (actor_kind in ('user', 'service', 'system')),
  action text not null,
  subject_type text not null,
  subject_id uuid,
  before jsonb,
  after jsonb,
  ip_hash text,
  user_agent text,
  request_id text,
  at timestamptz not null default now()
);
comment on table public.audit_log is 'Append-only. Written by audit_row() triggers and app_audit(). UPDATE/DELETE/TRUNCATE are revoked and blocked by trigger.';
create index audit_log_org_at_idx on public.audit_log (org_id, at desc);
create index audit_log_subject_idx on public.audit_log (subject_type, subject_id);
create index audit_log_actor_idx on public.audit_log (actor_id);

create or replace function public.audit_request_header(p_name text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_headers text := current_setting('request.headers', true);
begin
  if v_headers is null or v_headers = '' then
    return null;
  end if;
  return (v_headers::jsonb) ->> p_name;
exception when others then
  return null;
end;
$$;

create or replace function public.audit_actor_kind()
returns text
language sql
stable
set search_path = public
as $$
  select case
    when current_user in ('svc_drafts', 'svc_worker') then 'service'
    when auth.uid() is not null then 'user'
    else 'system'
  end;
$$;

-- Generic row audit trigger. The org id comes from the row's org_id column,
-- or from id for the orgs table. Tables without an org (profiles,
-- role_permissions) are logged with org_id null.
create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  v_row jsonb := coalesce(v_new, v_old);
  v_org uuid;
  v_subject uuid;
begin
  if tg_table_name = 'orgs' then
    v_org := (v_row ->> 'id')::uuid;
  elsif v_row ? 'org_id' then
    v_org := (v_row ->> 'org_id')::uuid;
  end if;

  -- When an org is deleted its child rows cascade; keep the log row but drop the dangling org reference.
  if v_org is not null and not exists (select 1 from public.orgs where id = v_org) then
    v_org := null;
  end if;

  v_subject := coalesce(v_row ->> 'id', v_row ->> 'user_id')::uuid;

  -- Never copy secret material into the log.
  v_old := v_old - 'token_hash';
  v_new := v_new - 'token_hash';

  insert into public.audit_log (org_id, actor_id, actor_kind, action, subject_type, subject_id, before, after, request_id, user_agent)
  values (
    v_org,
    auth.uid(),
    public.audit_actor_kind(),
    lower(tg_op),
    tg_table_name,
    v_subject,
    v_old,
    v_new,
    public.audit_request_header('x-request-id'),
    left(public.audit_request_header('user-agent'), 512)
  );
  return null;
end;
$$;

-- App-level audit entries (e.g. sign-in, MFA enrollment) written by server code.
-- The caller must be an internal member of the org (or the entry has no org).
create or replace function public.app_audit(
  p_org uuid,
  p_action text,
  p_subject_type text,
  p_subject_id uuid,
  p_after jsonb default null,
  p_ip_hash text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'app_audit requires a signed-in user' using errcode = '42501';
  end if;
  if p_org is not null and p_org not in (select public.auth_org_ids()) then
    raise exception 'Not a member of this org' using errcode = '42501';
  end if;
  if p_action !~ '^app\.[a-z0-9_.]{1,60}$' then
    raise exception 'App audit actions must start with app.' using errcode = '22023';
  end if;
  insert into public.audit_log (org_id, actor_id, actor_kind, action, subject_type, subject_id, after, ip_hash, request_id, user_agent)
  values (p_org, auth.uid(), 'user', p_action, p_subject_type, p_subject_id, p_after, p_ip_hash,
          public.audit_request_header('x-request-id'), left(public.audit_request_header('user-agent'), 512))
  returning id into v_id;
  return v_id;
end;
$$;

-- Blocks UPDATE, DELETE and TRUNCATE on append-only tables, for every role.
create or replace function public.block_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception '% is append-only: % is not allowed', tg_table_name, tg_op
    using errcode = '42501';
end;
$$;

create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function public.block_mutation();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.block_mutation();

-- Attach the row audit trigger to every Phase 0 core table.
do $$
declare
  t text;
begin
  foreach t in array array['orgs', 'brands', 'profiles', 'memberships', 'role_permissions', 'settings', 'api_tokens'] loop
    execute format(
      'create trigger %1$s_audit after insert or update or delete on public.%1$I
         for each row execute function public.audit_row()', t);
  end loop;
end;
$$;
