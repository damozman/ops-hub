-- Phase 0 review fixes (Jack's review of PR #1).

-- ---------------------------------------------------------------------------
-- #7 Org delete: audit_log keeps the org id as plain history. A foreign key
-- with ON DELETE SET NULL conflicted with the append-only guard, so deleting
-- an org always failed.
-- ---------------------------------------------------------------------------
alter table public.audit_log drop constraint if exists audit_log_org_id_fkey;
comment on column public.audit_log.org_id is 'Org the row belonged to. Plain uuid (no FK) so history survives org deletion.';

-- ---------------------------------------------------------------------------
-- Smaller gap: request id. The app forwards x-request-id to PostgREST, which
-- exposes it in request.headers; server jobs may set app.request_id instead.
-- ---------------------------------------------------------------------------
create or replace function public.audit_request_id()
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(nullif(current_setting('app.request_id', true), ''), public.audit_request_header('x-request-id'));
$$;

-- ---------------------------------------------------------------------------
-- #4 Service actors. Inside a SECURITY DEFINER trigger current_user is the
-- function owner, so look at the session role and the JWT role claim instead.
-- ---------------------------------------------------------------------------
create or replace function public.audit_actor_kind()
returns text
language sql
stable
set search_path = public
as $$
  select case
    when nullif(current_setting('role', true), 'none') in ('svc_drafts', 'svc_worker')
      or coalesce(auth.jwt() ->> 'role', '') in ('svc_drafts', 'svc_worker') then 'service'
    when auth.uid() is not null then 'user'
    else 'system'
  end;
$$;

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
    public.audit_request_id(),
    left(public.audit_request_header('user-agent'), 512)
  );
  return null;
end;
$$;

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
          public.audit_request_id(), left(public.audit_request_header('user-agent'), 512))
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- #3 Brand scope for member management, and #6 owner race.
-- ---------------------------------------------------------------------------

-- True when the given brand list is within the caller's own brand access.
-- A caller with all brands (null) may grant anything; a brand-limited caller
-- may only grant a non-null subset of their own brands.
create or replace function public.brand_ids_within_caller(p_org uuid, p_brand_ids uuid[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select m.brand_ids is null or (p_brand_ids is not null and p_brand_ids <@ m.brand_ids)
       from public.auth_membership(p_org) m
      where m.id is not null),
    false);
$$;

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
  if auth.uid() is not null then
    if v_touches_owner and not public.has_perm(v_org, 'org.manage') then
      raise exception 'Only an owner can grant, change or remove the owner role' using errcode = '42501';
    end if;

    -- Nobody changes their own role or brand access; another manager must do it.
    -- (Accepting your own invitation only changes status.)
    if tg_op = 'UPDATE' and old.user_id = auth.uid()
       and (new.role is distinct from old.role or new.brand_ids is distinct from old.brand_ids) then
      raise exception 'You cannot change your own role or brand access' using errcode = '42501';
    end if;
  end if;

  if tg_op in ('UPDATE', 'DELETE') and old.role = 'owner' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role <> 'owner' or new.status <> 'active') then
    -- Serialize concurrent owner changes for this org; a missing row means the org
    -- itself is being deleted (cascade), which is allowed.
    perform 1 from public.orgs where id = old.org_id for update;
    if found then
      select count(*) into v_remaining
      from public.memberships
      where org_id = old.org_id and role = 'owner' and status = 'active' and id <> old.id;
      if v_remaining = 0 then
        raise exception 'An org must keep at least one active owner' using errcode = '23514';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop policy memberships_insert on public.memberships;
drop policy memberships_update on public.memberships;
drop policy memberships_delete on public.memberships;

create policy memberships_insert on public.memberships for insert to authenticated
  with check (public.has_perm(org_id, 'members.manage') and public.brand_ids_within_caller(org_id, brand_ids));
create policy memberships_update on public.memberships for update to authenticated
  using (public.has_perm(org_id, 'members.manage') and public.brand_ids_within_caller(org_id, brand_ids))
  with check (public.has_perm(org_id, 'members.manage') and public.brand_ids_within_caller(org_id, brand_ids));
create policy memberships_delete on public.memberships for delete to authenticated
  using (public.has_perm(org_id, 'members.manage') and public.brand_ids_within_caller(org_id, brand_ids));

-- ---------------------------------------------------------------------------
-- #5 Function privileges. Hosted Supabase grants EXECUTE on new functions to
-- anon, authenticated and service_role by default. Revoke that default and
-- grant explicitly. tests/database/05_function_privileges enforces an allow-list.
-- ---------------------------------------------------------------------------
alter default privileges in schema public revoke execute on functions from public, anon, authenticated, service_role;
-- PUBLIC's EXECUTE default is global, so it can only be removed globally (per-schema defaults only add).
alter default privileges revoke execute on functions from public;

revoke execute on all functions in schema public from public, anon, authenticated, service_role;

-- Callable by signed-in users (they describe only the caller, or are used by RLS policies).
grant execute on function public.auth_requires_mfa() to authenticated;
grant execute on function public.auth_org_ids() to authenticated;
grant execute on function public.auth_role(uuid) to authenticated;
grant execute on function public.has_perm(uuid, text) to authenticated;
grant execute on function public.can_brand(uuid, uuid) to authenticated;
grant execute on function public.brand_ids_within_caller(uuid, uuid[]) to authenticated;
grant execute on function public.app_audit(uuid, text, text, uuid, jsonb, text) to authenticated;
grant execute on function public.accept_my_invites() to authenticated;
-- Trigger functions need no EXECUTE grant: privileges are checked when a trigger is created, not when it fires.
