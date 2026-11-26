-- Phase 2: grants and RLS. Default deny; explicit grants; anon and svc_* get nothing.
-- Read  := member + jobs.read + can_brand(org_id, brand_id)
-- Write := jobs.write (or drafts.write / checks.manage) + can_brand(org_id, brand_id)
-- Stage, draft status, checklists, check results, approvals and outbox status change only
-- through SECURITY DEFINER functions (guard triggers + column grants).

revoke all on public.client_accounts, public.jobs, public.job_stage_events, public.intake_checklists,
  public.delivery_checklists, public.job_items, public.audits, public.audit_findings, public.drafts,
  public.draft_versions, public.check_rules, public.check_runs, public.check_results, public.approvals,
  public.outbox_messages, public.deliverables
  from anon, authenticated, service_role, svc_drafts, svc_worker;

do $$
declare
  t text;
begin
  foreach t in array array['client_accounts', 'jobs', 'job_stage_events', 'intake_checklists', 'delivery_checklists',
    'job_items', 'audits', 'audit_findings', 'drafts', 'draft_versions', 'check_rules', 'check_runs', 'check_results',
    'approvals', 'outbox_messages', 'deliverables'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- Read policy shared by every brand-scoped Phase 2 table.
do $$
declare
  t text;
begin
  foreach t in array array['client_accounts', 'jobs', 'job_stage_events', 'intake_checklists', 'delivery_checklists',
    'job_items', 'audits', 'audit_findings', 'drafts', 'draft_versions', 'check_runs', 'check_results',
    'approvals', 'outbox_messages', 'deliverables'] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format($p$create policy %1$s_select on public.%1$I for select to authenticated
      using (org_id in (select public.auth_org_ids()) and public.has_perm(org_id, 'jobs.read')
             and public.can_brand(org_id, brand_id))$p$, t);
  end loop;
end;
$$;

-- client_accounts: create and edit with jobs.write (no delete: close the account instead).
grant insert (id, org_id, brand_id, company_id, status, data_sensitivity, ai_policy, portal_enabled, primary_contact_id),
  update (status, data_sensitivity, ai_policy, portal_enabled, primary_contact_id)
  on public.client_accounts to authenticated;
create policy client_accounts_insert on public.client_accounts for insert to authenticated
  with check (public.has_perm(org_id, 'jobs.write') and public.can_brand(org_id, brand_id));
create policy client_accounts_update on public.client_accounts for update to authenticated
  using (public.has_perm(org_id, 'jobs.write') and public.can_brand(org_id, brand_id))
  with check (public.has_perm(org_id, 'jobs.write') and public.can_brand(org_id, brand_id));

-- jobs: no UPDATE privilege on `stage` (column grants) and no delete (cancel instead).
grant insert (id, org_id, client_account_id, brand_id, offer, title, assignee_user_id, reviewer_user_id, due_at, scope,
              requires_client_approval, contract_ref, subscription_active),
  update (title, assignee_user_id, reviewer_user_id, due_at, scope, requires_client_approval, contract_ref, subscription_active)
  on public.jobs to authenticated;
create policy jobs_insert on public.jobs for insert to authenticated
  with check (public.has_perm(org_id, 'jobs.write') and public.can_brand(org_id, brand_id));
create policy jobs_update on public.jobs for update to authenticated
  using (public.has_perm(org_id, 'jobs.write') and public.can_brand(org_id, brand_id))
  with check (public.has_perm(org_id, 'jobs.write') and public.can_brand(org_id, brand_id));

-- job_items
grant insert (id, org_id, job_id, brand_id, kind, marketplace, external_ref, title, status, source_data),
  update (kind, marketplace, external_ref, title, status, source_data), delete
  on public.job_items to authenticated;
create policy job_items_insert on public.job_items for insert to authenticated
  with check (public.has_perm(org_id, 'jobs.write') and public.auth_sees_job(job_id));
create policy job_items_update on public.job_items for update to authenticated
  using (public.has_perm(org_id, 'jobs.write') and public.can_brand(org_id, brand_id))
  with check (public.has_perm(org_id, 'jobs.write') and public.can_brand(org_id, brand_id));
create policy job_items_delete on public.job_items for delete to authenticated
  using (public.has_perm(org_id, 'jobs.write') and public.can_brand(org_id, brand_id));

-- audits + findings (manual audits)
grant insert (id, org_id, job_id, brand_id, engine, rules_version, score, summary),
  update (rules_version, status, score, summary)
  on public.audits to authenticated;
create policy audits_insert on public.audits for insert to authenticated
  with check (public.has_perm(org_id, 'jobs.write') and public.auth_sees_job(job_id));
create policy audits_update on public.audits for update to authenticated
  using (public.has_perm(org_id, 'jobs.write') and public.can_brand(org_id, brand_id))
  with check (public.has_perm(org_id, 'jobs.write') and public.can_brand(org_id, brand_id));

grant insert (id, org_id, audit_id, brand_id, job_item_id, rule_key, severity, field, message, evidence),
  update (job_item_id, rule_key, severity, field, message, evidence), delete
  on public.audit_findings to authenticated;
create policy audit_findings_insert on public.audit_findings for insert to authenticated
  with check (public.has_perm(org_id, 'jobs.write')
              and exists (select 1 from public.audits a where a.id = audit_id and public.auth_sees_job(a.job_id)));
create policy audit_findings_update on public.audit_findings for update to authenticated
  using (public.has_perm(org_id, 'jobs.write') and public.can_brand(org_id, brand_id))
  with check (public.has_perm(org_id, 'jobs.write') and public.can_brand(org_id, brand_id));
create policy audit_findings_delete on public.audit_findings for delete to authenticated
  using (public.has_perm(org_id, 'jobs.write') and public.can_brand(org_id, brand_id));

-- drafts: status / current_version are not grantable.
grant insert (id, org_id, job_id, brand_id, job_item_id, kind, title, in_scope),
  update (job_item_id, kind, title, in_scope)
  on public.drafts to authenticated;
create policy drafts_insert on public.drafts for insert to authenticated
  with check (public.has_perm(org_id, 'drafts.write') and public.auth_sees_job(job_id));
create policy drafts_update on public.drafts for update to authenticated
  using (public.has_perm(org_id, 'drafts.write') and public.can_brand(org_id, brand_id))
  with check (public.has_perm(org_id, 'drafts.write') and public.can_brand(org_id, brand_id));

-- draft_versions: insert only, as yourself (the trigger stamps author and hash). Immutable afterwards.
grant insert (id, org_id, draft_id, brand_id, content, content_hash) on public.draft_versions to authenticated;
create policy draft_versions_insert on public.draft_versions for insert to authenticated
  with check (public.has_perm(org_id, 'drafts.write')
              and exists (select 1 from public.drafts d where d.id = draft_id and d.org_id = org_id
                          and public.can_brand(d.org_id, d.brand_id)));

-- check_rules: global defaults readable by members; org overrides managed with checks.manage.
grant select on public.check_rules to authenticated;
grant insert (id, org_id, rule_key, pack, title, severity, params, active), update (title, severity, params, active)
  on public.check_rules to authenticated;
create policy check_rules_select on public.check_rules for select to authenticated
  using (case when org_id is null
              then exists (select 1 from public.auth_org_ids())
              else org_id in (select public.auth_org_ids()) and public.has_perm(org_id, 'jobs.read') end);
create policy check_rules_insert on public.check_rules for insert to authenticated
  with check (org_id is not null and public.has_perm(org_id, 'checks.manage'));
create policy check_rules_update on public.check_rules for update to authenticated
  using (org_id is not null and public.has_perm(org_id, 'checks.manage'))
  with check (org_id is not null and public.has_perm(org_id, 'checks.manage'));

-- outbox: content editable with jobs.write; status only via functions.
grant insert (id, org_id, brand_id, job_id, channel, recipient, subject, body, payload, scheduled_for),
  update (channel, recipient, subject, body, payload, scheduled_for)
  on public.outbox_messages to authenticated;
create policy outbox_insert on public.outbox_messages for insert to authenticated
  with check (public.has_perm(org_id, 'jobs.write') and public.can_brand(org_id, brand_id));
create policy outbox_update on public.outbox_messages for update to authenticated
  using (public.has_perm(org_id, 'jobs.write') and public.can_brand(org_id, brand_id))
  with check (public.has_perm(org_id, 'jobs.write') and public.can_brand(org_id, brand_id));

-- deliverables: placeholders in Phase 2.
grant insert (id, org_id, job_id, brand_id, kind, status), update (kind, status) on public.deliverables to authenticated;
create policy deliverables_insert on public.deliverables for insert to authenticated
  with check (public.has_perm(org_id, 'jobs.write') and public.auth_sees_job(job_id));
create policy deliverables_update on public.deliverables for update to authenticated
  using (public.has_perm(org_id, 'jobs.write') and public.can_brand(org_id, brand_id))
  with check (public.has_perm(org_id, 'jobs.write') and public.can_brand(org_id, brand_id));

-- job_stage_events, intake/delivery checklists, check_runs/results, approvals: read only (functions write).

-- ===========================================================================
-- Brand visibility for notifications / digest on jobs and outbox items.
-- ===========================================================================
create or replace function public.crm_sees(p_user uuid, p_org uuid, p_type text, p_id uuid, p_depth int default 0)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_scope uuid[];
  v_found boolean;
  r record;
begin
  select m.brand_ids, true into v_scope, v_found
  from public.memberships m
  where m.org_id = p_org and m.user_id = p_user and m.status = 'active' and m.role <> 'client';
  if v_found is null then
    return false;
  end if;
  if v_scope is null then
    return true;  -- all brands
  end if;
  if p_id is null or p_depth > 3 then
    return false;
  end if;

  case p_type
    when 'deal' then
      return exists (select 1 from public.deals where id = p_id and org_id = p_org and brand_id = any (v_scope));
    when 'pipeline' then
      return exists (select 1 from public.pipelines where id = p_id and org_id = p_org and brand_id = any (v_scope));
    when 'form' then
      return exists (select 1 from public.forms where id = p_id and org_id = p_org and brand_id = any (v_scope));
    when 'company' then
      return exists (select 1 from public.companies
                     where id = p_id and org_id = p_org and (brand_ids is null or brand_ids && v_scope));
    when 'contact' then
      select company_id, brand_id into r from public.contacts where id = p_id and org_id = p_org;
      if not found then return false; end if;
      if r.company_id is not null then
        return coalesce(public.crm_sees(p_user, p_org, 'company', r.company_id, p_depth + 1), false);
      end if;
      return coalesce(r.brand_id = any (v_scope), false);
    when 'task' then
      select brand_id, subject_type, subject_id, assignee_user_id, created_by into r
      from public.tasks where id = p_id and org_id = p_org;
      if not found then return false; end if;
      if r.brand_id is not null then return coalesce(r.brand_id = any (v_scope), false); end if;
      if r.subject_id is not null then
        return coalesce(public.crm_sees(p_user, p_org, r.subject_type, r.subject_id, p_depth + 1), false);
      end if;
      return coalesce(p_user = any (array[r.assignee_user_id, r.created_by]), false);
    when 'activity' then
      select subject_type, subject_id into r from public.activities where id = p_id and org_id = p_org;
      return found and coalesce(public.crm_sees(p_user, p_org, r.subject_type, r.subject_id, p_depth + 1), false);
    when 'comment' then
      select subject_type, subject_id into r from public.comments where id = p_id and org_id = p_org;
      return found and coalesce(public.crm_sees(p_user, p_org, r.subject_type, r.subject_id, p_depth + 1), false);
    when 'consent' then
      select contact_id into r from public.consents where id = p_id and org_id = p_org;
      return found and r.contact_id is not null
             and coalesce(public.crm_sees(p_user, p_org, 'contact', r.contact_id, p_depth + 1), false);
    when 'booking' then
      select brand_id, contact_id into r from public.bookings where id = p_id and org_id = p_org;
      if not found then return false; end if;
      if r.brand_id is not null then return coalesce(r.brand_id = any (v_scope), false); end if;
      return r.contact_id is not null
             and coalesce(public.crm_sees(p_user, p_org, 'contact', r.contact_id, p_depth + 1), false);
    when 'file' then
      -- Contact-import CSVs hold other brands' leads: uploader and all-brand members only.
      select kind, uploaded_by into r from public.files where id = p_id and org_id = p_org;
      return found and (r.kind <> 'contact_import' or coalesce(r.uploaded_by = p_user, false));
    when 'job' then
      return exists (select 1 from public.jobs where id = p_id and org_id = p_org and brand_id = any (v_scope));
    when 'outbox_message' then
      return exists (select 1 from public.outbox_messages where id = p_id and org_id = p_org and brand_id = any (v_scope));
    when 'import_guard' then
      return true;  -- org-level guard templates (headers are hidden by their own RLS)
    else
      return false;
  end case;
end;
$$;


-- ===========================================================================
-- Function privileges (deny by default; see 06_function_privileges).
-- ===========================================================================
-- Trigger functions are never called directly.
revoke execute on function public.job_child_fill_brand(), public.job_item_same_job(), public.client_account_before_write(),
  public.job_before_write(), public.job_create_checklists(), public.checklist_guard(), public.audit_before_write(),
  public.audit_finding_guard(), public.draft_before_write(), public.draft_version_before_insert(),
  public.draft_version_after_insert(), public.check_rows_guard(), public.check_rule_before_write(),
  public.approvals_guard(), public.outbox_before_write(), public.outbox_after_edit()
  from public, anon, authenticated, service_role;
-- Internal helpers.
revoke execute on function public.draft_last_human_editor(uuid), public.version_checks_ok(uuid),
  public.job_bundle_hash(uuid), public.evaluate_gate(uuid, text), public.job_move_kind(text, text)
  from public, anon, authenticated, service_role;
-- Pure helpers used by invoker triggers (no data access).
revoke execute on function public.is_api_role(), public.canonical_json(jsonb), public.canonical_hash(jsonb),
  public.outbox_content_hash(text, text, text, text, jsonb) from public, anon;
grant execute on function public.is_api_role(), public.canonical_json(jsonb), public.canonical_hash(jsonb),
  public.outbox_content_hash(text, text, text, text, jsonb) to authenticated, service_role;
-- Domain functions for signed-in users (each checks permission and brand itself).
revoke execute on function public.auth_sees_job(uuid), public.set_checklist_item(uuid, text, text, boolean, text),
  public.override_check_result(uuid, text), public.job_gates(uuid), public.transition_job(uuid, text, text, boolean),
  public.approve_subject(text, uuid, text, text), public.release_outbox(uuid), public.cancel_outbox(uuid, text)
  from public, anon, service_role;
grant execute on function public.auth_sees_job(uuid), public.set_checklist_item(uuid, text, text, boolean, text),
  public.override_check_result(uuid, text), public.job_gates(uuid), public.transition_job(uuid, text, text, boolean),
  public.approve_subject(text, uuid, text, text), public.release_outbox(uuid), public.cancel_outbox(uuid, text)
  to authenticated;
-- The server-side checks engine records results with the service role.
revoke execute on function public.record_check_run(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_check_run(uuid, text, jsonb) to service_role;
grant select on public.jobs, public.drafts, public.draft_versions, public.job_items, public.check_rules to service_role;
