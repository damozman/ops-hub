-- Phase 0: grants and row-level security. Default deny everywhere.
-- Kickoff §F policy patterns, BUILD_PLAN §5.1.
--
-- Grants are explicit (supabase/config.jsonc sets auto_expose_new_tables=false,
-- and we also revoke here so hosted projects behave the same).

-- ---------------------------------------------------------------------------
-- Baseline: nobody but the table owner gets anything implicitly.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated, service_role;
revoke all on all tables in schema public from svc_drafts, svc_worker;
alter default privileges in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges in schema public revoke execute on functions from public, anon;

-- Trigger functions are never called directly.
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.set_created_by() from public, anon, authenticated;
revoke execute on function public.org_default_settings() from public, anon, authenticated;
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.guard_membership_change() from public, anon, authenticated;
revoke execute on function public.audit_row() from public, anon, authenticated;
revoke execute on function public.block_mutation() from public, anon, authenticated;

-- Helpers callable by signed-in users (they only describe the caller).
revoke execute on function public.auth_requires_mfa() from public, anon;
revoke execute on function public.auth_membership(uuid) from public, anon;
revoke execute on function public.auth_org_ids() from public, anon;
revoke execute on function public.auth_role(uuid) from public, anon;
revoke execute on function public.has_perm(uuid, text) from public, anon;
revoke execute on function public.can_brand(uuid, uuid) from public, anon;
revoke execute on function public.setting_bool(uuid, text, boolean) from public, anon;
revoke execute on function public.app_audit(uuid, text, text, uuid, jsonb, text) from public, anon;
grant execute on function public.auth_requires_mfa() to authenticated;
grant execute on function public.auth_org_ids() to authenticated;
grant execute on function public.auth_role(uuid) to authenticated;
grant execute on function public.has_perm(uuid, text) to authenticated;
grant execute on function public.can_brand(uuid, uuid) to authenticated;
grant execute on function public.app_audit(uuid, text, text, uuid, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS on every table
-- ---------------------------------------------------------------------------

alter table public.orgs enable row level security;
alter table public.brands enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.role_permissions enable row level security;
alter table public.settings enable row level security;
alter table public.audit_log enable row level security;
alter table public.api_tokens enable row level security;

-- ---------------------------------------------------------------------------
-- orgs
-- ---------------------------------------------------------------------------
grant select on public.orgs to authenticated;
grant update (name, settings) on public.orgs to authenticated;

create policy orgs_select on public.orgs for select to authenticated
  using (id in (select public.auth_org_ids()));
create policy orgs_update on public.orgs for update to authenticated
  using (public.has_perm(id, 'org.manage'))
  with check (public.has_perm(id, 'org.manage'));
-- No insert/delete for app users: orgs are created by the owner via a server job (service role).

-- ---------------------------------------------------------------------------
-- brands (brand-scoped by id)
-- ---------------------------------------------------------------------------
grant select, insert, delete on public.brands to authenticated;
grant update (name, from_email, legal_footer, report_theme) on public.brands to authenticated;

create policy brands_select on public.brands for select to authenticated
  using (org_id in (select public.auth_org_ids()) and public.can_brand(org_id, id));
create policy brands_insert on public.brands for insert to authenticated
  with check (public.has_perm(org_id, 'settings.manage'));
create policy brands_update on public.brands for update to authenticated
  using (public.has_perm(org_id, 'settings.manage') and public.can_brand(org_id, id))
  with check (public.has_perm(org_id, 'settings.manage'));
create policy brands_delete on public.brands for delete to authenticated
  using (public.has_perm(org_id, 'settings.manage') and public.can_brand(org_id, id));

-- ---------------------------------------------------------------------------
-- profiles: your own, plus people who share an internal org with you
-- ---------------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

create policy profiles_select on public.profiles for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.memberships m
      where m.user_id = profiles.user_id
        and m.org_id in (select public.auth_org_ids())
    )
  );
create policy profiles_update_own on public.profiles for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- memberships
-- ---------------------------------------------------------------------------
grant select, insert, delete on public.memberships to authenticated;
grant update (role, brand_ids, status) on public.memberships to authenticated;

create policy memberships_select on public.memberships for select to authenticated
  using (user_id = auth.uid() or org_id in (select public.auth_org_ids()));
create policy memberships_insert on public.memberships for insert to authenticated
  with check (public.has_perm(org_id, 'members.manage'));
create policy memberships_update on public.memberships for update to authenticated
  using (public.has_perm(org_id, 'members.manage'))
  with check (public.has_perm(org_id, 'members.manage'));
create policy memberships_delete on public.memberships for delete to authenticated
  using (public.has_perm(org_id, 'members.manage'));

-- An invited user activates their own invitations on first sign-in.
create or replace function public.accept_my_invites()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if auth.uid() is null then
    return 0;
  end if;
  update public.memberships
     set status = 'active'
   where user_id = auth.uid() and status = 'invited';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.accept_my_invites() from public, anon;
grant execute on function public.accept_my_invites() to authenticated;

-- ---------------------------------------------------------------------------
-- role_permissions: readable by signed-in users, never writable
-- ---------------------------------------------------------------------------
grant select on public.role_permissions to authenticated;
create policy role_permissions_select on public.role_permissions for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- settings
-- ---------------------------------------------------------------------------
grant select, insert, delete on public.settings to authenticated;
grant update (value) on public.settings to authenticated;

create policy settings_select on public.settings for select to authenticated
  using (org_id in (select public.auth_org_ids()));
create policy settings_insert on public.settings for insert to authenticated
  with check (public.has_perm(org_id, 'settings.manage'));
create policy settings_update on public.settings for update to authenticated
  using (public.has_perm(org_id, 'settings.manage'))
  with check (public.has_perm(org_id, 'settings.manage'));
create policy settings_delete on public.settings for delete to authenticated
  using (public.has_perm(org_id, 'settings.manage'));

-- ---------------------------------------------------------------------------
-- audit_log: select only. Owner/admin see the org's log; operators see only
-- their own actions. Rows are written by security-definer triggers/functions.
-- ---------------------------------------------------------------------------
grant select on public.audit_log to authenticated;
grant select on public.audit_log to service_role;

create policy audit_log_select on public.audit_log for select to authenticated
  using (
    org_id in (select public.auth_org_ids())
    and public.has_perm(org_id, 'audit.read')
    and (public.auth_role(org_id) in ('owner', 'admin') or actor_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- api_tokens: owner/admin only, and never the hash column
-- ---------------------------------------------------------------------------
grant select (id, org_id, name, kind, scopes, allowed_brand_ids, expires_at, last_used_at, revoked_at, created_at, updated_at, created_by)
  on public.api_tokens to authenticated;
grant update (revoked_at) on public.api_tokens to authenticated;

create policy api_tokens_select on public.api_tokens for select to authenticated
  using (public.has_perm(org_id, 'settings.manage'));
create policy api_tokens_revoke on public.api_tokens for update to authenticated
  using (public.has_perm(org_id, 'settings.manage'))
  with check (public.has_perm(org_id, 'settings.manage'));
-- Token creation (which needs the pepper) happens server-side with the service role in Phase 3.

-- ---------------------------------------------------------------------------
-- service_role (server jobs, seed scripts, invitations). Bypasses RLS by design;
-- used only in server code paths (BUILD_PLAN §5.4). Still cannot modify audit_log.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on
  public.orgs, public.brands, public.profiles, public.memberships,
  public.role_permissions, public.settings, public.api_tokens
  to service_role;
