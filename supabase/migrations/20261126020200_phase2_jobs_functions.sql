-- Phase 2: domain functions and triggers for jobs, stage gates, checks, approvals and the outbox.
-- BUILD_PLAN §3.3 (state machine), §3.4 (approval integrity), §3.5 (checks); kickoff §F.
--
-- "Only a function may do this" rules (stage, draft status, approvals, outbox status, check
-- results) are enforced by checking current_user inside the guard triggers: a signed-in user
-- or a service role runs as `authenticated` / `service_role` / `svc_*`, while SECURITY DEFINER
-- functions run as the migration owner. Column grants (in the RLS migration) are a second lock.

-- True when the current statement runs as an API role (not inside one of our SECURITY DEFINER functions).
create or replace function public.is_api_role()
returns boolean
language sql
stable
set search_path = public
as $$
  select current_user in ('authenticated', 'anon', 'service_role', 'svc_drafts', 'svc_worker');
$$;

-- ===========================================================================
-- Canonical JSON + hash (BUILD_PLAN §3.4). Mirrored by src/lib/canonical-hash.ts.
--   objects: keys sorted by UTF-8 bytes, no whitespace; arrays in order;
--   strings JSON-escaped; numbers without trailing zeros (1.50 -> 1.5, 2.0 -> 2).
-- ===========================================================================
create or replace function public.canonical_json(p jsonb)
returns text
language plpgsql
immutable
strict
set search_path = public
as $$
declare
  v_out text;
begin
  case jsonb_typeof(p)
    when 'object' then
      select '{' || coalesce(string_agg(to_jsonb(k)::text || ':' || public.canonical_json(v), ',' order by k collate "C"), '') || '}'
        into v_out from jsonb_each(p) as e(k, v);
      return v_out;
    when 'array' then
      select '[' || coalesce(string_agg(public.canonical_json(v), ',' order by i), '') || ']'
        into v_out from jsonb_array_elements(p) with ordinality as e(v, i);
      return v_out;
    when 'number' then
      return trim_scale((p #>> '{}')::numeric)::text;
    else
      return p::text;  -- string (escaped), true, false, null
  end case;
end;
$$;

create or replace function public.canonical_hash(p jsonb)
returns text
language sql
immutable
strict
set search_path = public
as $$
  select encode(sha256(convert_to(public.canonical_json(p), 'UTF8')), 'hex');
$$;

-- The signed-in user can see this job (member, jobs.read, brand). Used by insert policies on job children.
create or replace function public.auth_sees_job(p_job uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select public.has_perm(j.org_id, 'jobs.read') and public.can_brand(j.org_id, j.brand_id)
                   from public.jobs j where j.id = p_job), false);
$$;

-- ===========================================================================
-- Brand on job children: copied from the parent so RLS can use can_brand().
-- TG_ARGV[0] = parent kind.
-- ===========================================================================
create or replace function public.job_child_fill_brand()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_brand uuid;
begin
  case tg_argv[0]
    when 'job' then select org_id, brand_id into v_org, v_brand from public.jobs where id = new.job_id;
    when 'audit' then select org_id, brand_id into v_org, v_brand from public.audits where id = new.audit_id;
    when 'draft' then select org_id, brand_id into v_org, v_brand from public.drafts where id = new.draft_id;
    when 'draft_version' then select org_id, brand_id into v_org, v_brand from public.draft_versions where id = new.draft_version_id;
    when 'check_run' then select org_id, brand_id into v_org, v_brand from public.check_runs where id = new.check_run_id;
  end case;
  if v_org is null or v_org <> new.org_id then
    raise exception 'Parent record not found in this org.' using errcode = '23503';
  end if;
  if tg_op = 'UPDATE' and new.brand_id is distinct from old.brand_id and new.brand_id is distinct from v_brand then
    raise exception 'brand_id follows the job and cannot be changed.' using errcode = '42501';
  end if;
  new.brand_id := v_brand;
  return new;
end;
$$;

do $$
declare
  r record;
begin
  for r in select * from (values
    ('job_stage_events', 'job'), ('intake_checklists', 'job'), ('delivery_checklists', 'job'), ('job_items', 'job'),
    ('audits', 'job'), ('drafts', 'job'), ('deliverables', 'job'),
    ('audit_findings', 'audit'), ('draft_versions', 'draft'), ('check_runs', 'draft_version'), ('check_results', 'check_run')
  ) as t(tbl, parent) loop
    execute format('create trigger %1$s_fill_brand before insert or update on public.%1$I
                      for each row execute function public.job_child_fill_brand(%2$L)', r.tbl, r.parent);
  end loop;
end;
$$;

-- Job items referenced by drafts / findings must belong to the same job.
create or replace function public.job_item_same_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job uuid;
begin
  if new.job_item_id is null then return new; end if;
  if tg_table_name = 'drafts' then
    v_job := (to_jsonb(new) ->> 'job_id')::uuid;
  else
    select job_id into v_job from public.audits where id = (to_jsonb(new) ->> 'audit_id')::uuid;
  end if;
  if not exists (select 1 from public.job_items where id = new.job_item_id and job_id = v_job) then
    raise exception 'That item belongs to a different job.' using errcode = '23503';
  end if;
  return new;
end;
$$;
create trigger drafts_item_same_job before insert or update of job_item_id on public.drafts
  for each row execute function public.job_item_same_job();
create trigger audit_findings_item_same_job before insert or update of job_item_id on public.audit_findings
  for each row execute function public.job_item_same_job();

-- ===========================================================================
-- Client accounts: the company must be in the org and visible to the account's brand.
-- ===========================================================================
create or replace function public.client_account_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.companies c
                 where c.id = new.company_id and c.org_id = new.org_id
                   and (c.brand_ids is null or new.brand_id = any (c.brand_ids))) then
    raise exception 'Pick a company that belongs to this brand.' using errcode = '23503';
  end if;
  if new.primary_contact_id is not null
     and not exists (select 1 from public.contacts where id = new.primary_contact_id and org_id = new.org_id) then
    raise exception 'Primary contact not found.' using errcode = '23503';
  end if;
  if tg_op = 'UPDATE' and (new.brand_id <> old.brand_id or new.company_id <> old.company_id) then
    raise exception 'A client account''s brand and company cannot change.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger client_accounts_before_write before insert or update on public.client_accounts
  for each row execute function public.client_account_before_write();

-- ===========================================================================
-- Jobs: stage changes only through transition_job(); brand follows the client account.
-- ===========================================================================
create or replace function public.job_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_brand uuid;
begin
  if tg_op = 'INSERT' then
    select brand_id into v_brand from public.client_accounts where id = new.client_account_id and org_id = new.org_id;
    if v_brand is null then
      raise exception 'Client account not found.' using errcode = '23503';
    end if;
    if new.brand_id is not null and new.brand_id <> v_brand then
      raise exception 'A job''s brand must match its client account.' using errcode = '23514';
    end if;
    new.brand_id := v_brand;
    if public.is_api_role() then
      new.stage := 'intake';
    end if;
    new.stage_changed_at := now();
    return new;
  end if;

  if new.brand_id <> old.brand_id or new.client_account_id <> old.client_account_id or new.org_id <> old.org_id then
    raise exception 'A job''s client account and brand cannot change.' using errcode = '42501';
  end if;
  if new.stage is distinct from old.stage then
    if public.is_api_role() then
      raise exception 'Job stage changes only through transition_job().' using errcode = '42501';
    end if;
    new.stage_changed_at := now();
  end if;
  return new;
end;
$$;
create trigger jobs_before_write before insert or update on public.jobs
  for each row execute function public.job_before_write();

-- Default checklists for every new job (kickoff §E; BUILD_PLAN §3.3 G1/G5).
create or replace function public.job_create_checklists()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.intake_checklists (org_id, brand_id, job_id, items, created_by)
  select new.org_id, new.brand_id, new.id,
         jsonb_agg(jsonb_build_object('key', k, 'label', l, 'done', false, 'done_by', null, 'done_at', null, 'evidence', null) order by o),
         new.created_by
  from (values
    (1, 'scope_set', 'Scope set'),
    (2, 'brand_set', 'Brand set'),
    (3, 'sensitivity_set', 'Data sensitivity set'),
    (4, 'access_confirmed', 'Access confirmed (OAuth connection active, or CSV import chosen)'),
    (5, 'owner_contact_set', 'Client account owner contact set'),
    (6, 'contract_recorded', 'Signed proposal or Upwork contract reference recorded')
  ) as d(o, k, l);

  insert into public.delivery_checklists (org_id, brand_id, job_id, items, created_by)
  select new.org_id, new.brand_id, new.id,
         jsonb_agg(jsonb_build_object('key', k, 'label', l, 'done', false, 'done_by', null, 'done_at', null, 'evidence', null) order by o),
         new.created_by
  from (values
    (1, 'backup_taken', 'Backup of the current live listing / profile taken'),
    (2, 'deliverables_uploaded', 'Deliverables uploaded or applied by a user'),
    (3, 'client_notified', 'Client notified')
  ) as d(o, k, l);
  return null;
end;
$$;
create trigger jobs_create_checklists after insert on public.jobs
  for each row execute function public.job_create_checklists();

-- Checklist items are ticked only here, so done_by / done_at are always truthful.
create or replace function public.set_checklist_item(p_job uuid, p_list text, p_key text, p_done boolean, p_evidence text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  j record;
  v_items jsonb;
  v_new jsonb;
begin
  select id, org_id, brand_id, stage into j from public.jobs where id = p_job;
  if not found or not public.has_perm(j.org_id, 'jobs.write') or not public.can_brand(j.org_id, j.brand_id) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if j.stage in ('closed', 'cancelled') then
    raise exception 'This job is %.', j.stage using errcode = '42501';
  end if;
  if p_list = 'intake' then
    select items into v_items from public.intake_checklists where job_id = p_job for update;
  elsif p_list = 'delivery' then
    select items into v_items from public.delivery_checklists where job_id = p_job for update;
  else
    raise exception 'Unknown checklist %.', p_list using errcode = '22023';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_items) e where e ->> 'key' = p_key) then
    raise exception 'Unknown checklist item %.', p_key using errcode = '22023';
  end if;

  select jsonb_agg(case when e ->> 'key' = p_key then
           e || jsonb_build_object('done', p_done,
                                   'done_by', case when p_done then auth.uid() end,
                                   'done_at', case when p_done then now() end,
                                   'evidence', nullif(left(trim(coalesce(p_evidence, '')), 500), ''))
         else e end order by i)
    into v_new
  from jsonb_array_elements(v_items) with ordinality as x(e, i);

  if p_list = 'intake' then
    update public.intake_checklists set items = v_new where job_id = p_job;
  else
    update public.delivery_checklists set items = v_new where job_id = p_job;
  end if;
  perform public.emit_event(j.org_id, 'checklist.updated', 'job', p_job,
    jsonb_build_object('list', p_list, 'key', p_key, 'done', p_done));
  return v_new;
end;
$$;

create or replace function public.checklist_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_api_role() then
    raise exception 'Checklists change only through set_checklist_item().' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger intake_checklists_guard before update on public.intake_checklists
  for each row execute function public.checklist_guard();
create trigger delivery_checklists_guard before update on public.delivery_checklists
  for each row execute function public.checklist_guard();

-- ===========================================================================
-- Audits (Phase 2: manual audits). Finished audits are frozen.
-- ===========================================================================
create or replace function public.audit_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.status := 'running';
    new.finished_at := null;
    if new.engine = 'manual' and new.rules_version is null then
      new.rules_version := 'manual-v1';
    end if;
    return new;
  end if;
  if old.status <> 'running' then
    raise exception 'This audit is % and can no longer change.', old.status using errcode = '42501';
  end if;
  if new.job_id <> old.job_id then
    raise exception 'An audit cannot move to another job.' using errcode = '42501';
  end if;
  if new.status = 'finished' then
    if new.rules_version is null or length(trim(new.rules_version)) = 0 then
      raise exception 'Record the rules version before finishing the audit.' using errcode = '23514';
    end if;
    new.finished_at := now();
  elsif new.status = 'failed' then
    new.finished_at := now();
  end if;
  return new;
end;
$$;
create trigger audits_before_write before insert or update on public.audits
  for each row execute function public.audit_before_write();

create or replace function public.audit_finding_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_audit uuid := case when tg_op = 'DELETE' then old.audit_id else new.audit_id end;
begin
  if not exists (select 1 from public.orgs where id = (case when tg_op = 'DELETE' then old.org_id else new.org_id end)) then
    return coalesce(new, old);  -- org cascade
  end if;
  if exists (select 1 from public.audits where id = v_audit and status <> 'running') then
    raise exception 'Findings can only change while the audit is running.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.audit_id <> old.audit_id then
    raise exception 'A finding cannot move to another audit.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger audit_findings_guard before insert or update or delete on public.audit_findings
  for each row execute function public.audit_finding_guard();

-- ===========================================================================
-- Drafts and versions
-- ===========================================================================
create or replace function public.draft_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_stage text;
begin
  if tg_op = 'INSERT' then
    select stage into v_stage from public.jobs where id = new.job_id;
    if v_stage in ('delivered', 'closed', 'cancelled') then
      raise exception 'Drafts can''t be added to a % job.', v_stage using errcode = '42501';
    end if;
    if public.is_api_role() then
      new.status := 'draft';
      new.current_version_id := null;
    end if;
    return new;
  end if;
  if new.job_id <> old.job_id then
    raise exception 'A draft cannot move to another job.' using errcode = '42501';
  end if;
  if public.is_api_role() and (new.status is distinct from old.status or new.current_version_id is distinct from old.current_version_id) then
    raise exception 'Draft status changes only through checks, approvals and stage transitions.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger drafts_before_write before insert or update on public.drafts
  for each row execute function public.draft_before_write();

-- Last human (author_kind = 'user') to write a version of a draft.
create or replace function public.draft_last_human_editor(p_draft uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select author_id from public.draft_versions
  where draft_id = p_draft and author_kind = 'user' and author_id is not null
  order by version desc limit 1;
$$;

create or replace function public.draft_version_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d record;
  v_hash text;
begin
  select dr.id, dr.org_id, j.stage into d
  from public.drafts dr join public.jobs j on j.id = dr.job_id
  where dr.id = new.draft_id
  for update of dr;
  if not found then
    raise exception 'Draft not found.' using errcode = '23503';
  end if;
  if d.stage in ('delivered', 'closed', 'cancelled') then
    raise exception 'Drafts on a % job can''t be edited.', d.stage using errcode = '42501';
  end if;

  -- Signed-in users always write as themselves. AI / Jack versions arrive through service code in Phase 3.
  if auth.uid() is not null then
    new.author_kind := 'user';
    new.author_id := auth.uid();
  elsif new.author_kind = 'user' and new.author_id is null then
    raise exception 'A user version needs an author.' using errcode = '23502';
  end if;

  select coalesce(max(version), 0) + 1 into new.version from public.draft_versions where draft_id = new.draft_id;

  v_hash := public.canonical_hash(new.content);
  if nullif(new.content_hash, '') is not null and new.content_hash <> v_hash then
    raise exception 'content_hash does not match the content.' using errcode = '23514';
  end if;
  new.content_hash := v_hash;
  return new;
end;
$$;
create trigger draft_versions_before_insert before insert on public.draft_versions
  for each row execute function public.draft_version_before_insert();

create trigger draft_versions_append_only before update or delete on public.draft_versions
  for each row execute function public.block_mutation_unless_org_deleted();

-- After a new version: it becomes current, the draft waits for checks, every earlier
-- approval of this draft (and the job bundle) goes stale, and an approved job falls back to drafts.
create or replace function public.draft_version_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job record;
  v_stale int;
begin
  update public.drafts set current_version_id = new.id, status = 'draft' where id = new.draft_id;

  select j.id, j.org_id, j.brand_id, j.stage into v_job
  from public.jobs j join public.drafts d on d.job_id = j.id where d.id = new.draft_id;

  update public.approvals a set stale = true
  where not a.stale
    and ((a.subject_type = 'draft_version'
          and a.subject_id in (select id from public.draft_versions where draft_id = new.draft_id and id <> new.id))
         or (a.subject_type = 'bundle' and a.job_id = v_job.id));
  get diagnostics v_stale = row_count;

  if v_job.stage = 'approved' then
    update public.jobs set stage = 'drafts' where id = v_job.id;
    insert into public.job_stage_events (org_id, brand_id, job_id, from_stage, to_stage, actor_id, actor_kind, reason, gate_results)
    values (v_job.org_id, v_job.brand_id, v_job.id, 'approved', 'drafts', auth.uid(),
            case when auth.uid() is null then 'system' else 'user' end, 'content_changed_after_approval',
            jsonb_build_array(jsonb_build_object('gate', 'auto', 'passed', true, 'draft_id', new.draft_id, 'approvals_marked_stale', v_stale)));
    perform public.emit_event(v_job.org_id, 'job.transitioned', 'job', v_job.id,
      jsonb_build_object('from', 'approved', 'to', 'drafts', 'reason', 'content_changed_after_approval'));
  end if;
  return null;
end;
$$;
create trigger draft_versions_after_insert after insert on public.draft_versions
  for each row execute function public.draft_version_after_insert();

-- ===========================================================================
-- Check runs: written by the server-side checks engine (service_role) only.
-- ===========================================================================
-- Per-version verdict used by G3 and approvals: the latest run passed, or every blocker in it was overridden.
create or replace function public.version_checks_ok(p_version uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select r.passed or not exists (
             select 1 from public.check_results x
             where x.check_run_id = r.id and x.severity = 'blocker' and x.override_by is null)
    from public.check_runs r
    where r.draft_version_id = p_version
    order by r.created_at desc, r.id desc
    limit 1), false);
$$;

create or replace function public.record_check_run(p_version uuid, p_rules_version text, p_results jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  v_run uuid;
  v_blockers int;
  v_warnings int;
begin
  select dv.id, dv.org_id, dv.draft_id, d.current_version_id into v
  from public.draft_versions dv join public.drafts d on d.id = dv.draft_id
  where dv.id = p_version;
  if not found then
    raise exception 'Draft version not found.' using errcode = '23503';
  end if;
  if jsonb_typeof(p_results) <> 'array' then
    raise exception 'Results must be a JSON array.' using errcode = '22023';
  end if;

  select count(*) filter (where e ->> 'severity' = 'blocker'), count(*) filter (where e ->> 'severity' = 'warning')
    into v_blockers, v_warnings
  from jsonb_array_elements(p_results) e;

  insert into public.check_runs (org_id, draft_version_id, rules_version, passed, blocker_count, warning_count)
  values (v.org_id, p_version, p_rules_version, v_blockers = 0, v_blockers, v_warnings)
  returning id into v_run;

  insert into public.check_results (org_id, check_run_id, rule_key, severity, message, span)
  select v.org_id, v_run, e ->> 'rule_key', e ->> 'severity', left(e ->> 'message', 1000), e -> 'span'
  from jsonb_array_elements(p_results) e;

  if v.current_version_id = p_version then
    update public.drafts set status = case when v_blockers = 0 then 'ready_for_review' else 'checks_failed' end
    where id = v.draft_id and status in ('draft', 'checks_failed', 'ready_for_review');
  end if;
  perform public.emit_event(v.org_id, 'checks.ran', 'draft', v.draft_id,
    jsonb_build_object('version_id', p_version, 'run_id', v_run, 'blockers', v_blockers, 'warnings', v_warnings));
  return v_run;
end;
$$;

create or replace function public.check_rows_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.orgs where id = old.org_id) then return old; end if;
    raise exception '% rows are kept as evidence and cannot be deleted.', tg_table_name using errcode = '42501';
  end if;
  if public.is_api_role() then
    raise exception '% rows are written only by the checks engine.', tg_table_name using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger check_runs_guard before insert or update or delete on public.check_runs
  for each row execute function public.check_rows_guard();
create trigger check_results_guard before insert or update or delete on public.check_results
  for each row execute function public.check_rows_guard();

-- Owner/admin (checks.override) can accept a blocker with a reason. Audited by audit_row.
create or replace function public.override_check_result(p_result uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  select x.id, x.org_id, x.brand_id, x.severity, x.override_by, x.check_run_id, cr.draft_version_id, dv.draft_id
    into r
  from public.check_results x
  join public.check_runs cr on cr.id = x.check_run_id
  join public.draft_versions dv on dv.id = cr.draft_version_id
  where x.id = p_result;
  if not found or not public.has_perm(r.org_id, 'checks.override') or not public.can_brand(r.org_id, r.brand_id) then
    raise exception 'Not allowed: overriding a check needs the checks.override permission.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Give a reason for the override.' using errcode = '23514';
  end if;
  if r.override_by is not null then
    raise exception 'This result was already overridden.' using errcode = '23505';
  end if;
  if r.severity <> 'blocker' then
    raise exception 'Only blockers need an override.' using errcode = '22023';
  end if;

  update public.check_results
  set override_by = auth.uid(), override_reason = left(trim(p_reason), 1000), override_at = now()
  where id = p_result;

  if public.version_checks_ok(r.draft_version_id) then
    update public.drafts set status = 'ready_for_review'
    where id = r.draft_id and current_version_id = r.draft_version_id and status = 'checks_failed';
  end if;
  perform public.emit_event(r.org_id, 'checks.overridden', 'draft', r.draft_id,
    jsonb_build_object('result_id', p_result, 'reason', left(trim(p_reason), 1000)));
end;
$$;

-- Org rule overrides bump their version when the rule changes.
create or replace function public.check_rule_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.rule_key <> old.rule_key or new.org_id is distinct from old.org_id then
      raise exception 'A rule''s key and org cannot change.' using errcode = '42501';
    end if;
    if (new.params, new.severity, new.active) is distinct from (old.params, old.severity, old.active) then
      new.version := old.version + 1;
    end if;
  end if;
  return new;
end;
$$;
create trigger check_rules_before_write before insert or update on public.check_rules
  for each row execute function public.check_rule_before_write();

-- ===========================================================================
-- Approvals: insert only via approve_subject(); `stale` only false -> true by trigger.
-- ===========================================================================
create or replace function public.approvals_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.orgs where id = old.org_id) then return old; end if;
    raise exception 'approvals are append-only.' using errcode = '42501';
  end if;
  if public.is_api_role() then
    raise exception 'approvals are written only by approve_subject().' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (
       (to_jsonb(new) - 'stale' - 'updated_at') is distinct from (to_jsonb(old) - 'stale' - 'updated_at')
       or (old.stale and not new.stale)) then
    raise exception 'approvals are append-only (only stale may be set).' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger approvals_guard before insert or update or delete on public.approvals
  for each row execute function public.approvals_guard();

-- ===========================================================================
-- Outbox
-- ===========================================================================
create or replace function public.outbox_content_hash(p_channel text, p_recipient text, p_subject text, p_body text, p_payload jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select public.canonical_hash(jsonb_build_object(
    'channel', p_channel, 'recipient', p_recipient, 'subject', p_subject, 'body', p_body,
    'payload', coalesce(p_payload, '{}'::jsonb)));
$$;

create or replace function public.outbox_before_write()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_job record;
begin
  if tg_op = 'INSERT' then
    if new.job_id is not null then
      select org_id, brand_id, stage into v_job from public.jobs where id = new.job_id;
      if v_job.org_id is distinct from new.org_id or v_job.brand_id is distinct from new.brand_id then
        raise exception 'The outbox item''s brand must match its job.' using errcode = '23514';
      end if;
    end if;
    if public.is_api_role() then
      new.status := 'pending_approval';
      new.approval_id := null;
      new.sent_at := null;
      new.sent_by := null;
      new.provider_id := null;
      new.block_reason := null;
    end if;
    new.last_edited_by := coalesce(auth.uid(), new.last_edited_by);
    new.content_hash := public.outbox_content_hash(new.channel, new.recipient, new.subject, new.body, new.payload);
    return new;
  end if;

  if new.org_id <> old.org_id or new.brand_id <> old.brand_id or new.job_id is distinct from old.job_id then
    raise exception 'An outbox item cannot move to another brand or job.' using errcode = '42501';
  end if;
  if (new.channel, new.recipient, new.subject, new.body, new.payload)
     is distinct from (old.channel, old.recipient, old.subject, old.body, old.payload) then
    if old.status in ('sent', 'cancelled', 'queued') then
      raise exception 'A % outbox item can''t be edited.', old.status using errcode = '42501';
    end if;
    new.content_hash := public.outbox_content_hash(new.channel, new.recipient, new.subject, new.body, new.payload);
    new.last_edited_by := coalesce(auth.uid(), new.last_edited_by);
    -- Content changed: any approval no longer covers it.
    if old.status = 'approved' then
      new.status := 'pending_approval';
      new.approval_id := null;
    end if;
    return new;
  end if;
  if public.is_api_role() and (
       new.status is distinct from old.status or new.approval_id is distinct from old.approval_id
       or new.content_hash is distinct from old.content_hash or new.sent_at is distinct from old.sent_at
       or new.sent_by is distinct from old.sent_by or new.provider_id is distinct from old.provider_id
       or new.last_edited_by is distinct from old.last_edited_by) then
    raise exception 'Outbox status changes only through approve_subject(), release_outbox() and cancel_outbox().' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger outbox_before_write before insert or update on public.outbox_messages
  for each row execute function public.outbox_before_write();

create or replace function public.outbox_after_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.content_hash is distinct from old.content_hash then
    update public.approvals set stale = true
    where subject_type = 'outbox_message' and subject_id = new.id and not stale;
  end if;
  return null;
end;
$$;
create trigger outbox_after_edit after update on public.outbox_messages
  for each row execute function public.outbox_after_edit();

-- ===========================================================================
-- Gates G1-G6 (BUILD_PLAN §3.3). Each returns {gate, label, passed, blockers[]}.
-- ===========================================================================
create or replace function public.job_bundle_hash(p_job uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.canonical_hash(coalesce(jsonb_agg(dv.content_hash order by d.id), '[]'::jsonb))
  from public.drafts d join public.draft_versions dv on dv.id = d.current_version_id
  where d.job_id = p_job and d.in_scope and d.status <> 'superseded';
$$;

create or replace function public.evaluate_gate(p_job uuid, p_gate text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  j record;
  v_blockers text[] := '{}';
  v_label text;
  r record;
  v_two_person boolean;
  v_count int;
begin
  select * into j from public.jobs where id = p_job;
  v_two_person := public.setting_bool(j.org_id, 'two_person_rule', true);

  case p_gate
    when 'G1' then
      v_label := 'Intake checklist complete';
      select coalesce(array_agg(e ->> 'label' order by i), '{}') into v_blockers
      from public.intake_checklists c, jsonb_array_elements(c.items) with ordinality as x(e, i)
      where c.job_id = p_job and not coalesce((e ->> 'done')::boolean, false);
      v_blockers := array(select 'Not done: ' || b from unnest(v_blockers) b);

    when 'G2' then
      v_label := 'Audit finished with a rules version';
      select status, rules_version into r from public.audits where job_id = p_job order by created_at desc, id desc limit 1;
      if not found then
        v_blockers := array['No audit has been run for this job.'];
      elsif r.status <> 'finished' then
        v_blockers := array[format('The latest audit is %s, not finished.', r.status)];
      elsif r.rules_version is null then
        v_blockers := array['The latest audit has no rules version.'];
      end if;

    when 'G3' then
      v_label := 'Every in-scope draft passes checks';
      select count(*) into v_count from public.drafts where job_id = p_job and in_scope and status <> 'superseded';
      if v_count = 0 then
        v_blockers := array['There are no in-scope drafts.'];
      end if;
      for r in
        select d.id, coalesce(d.title, d.kind) as name, d.current_version_id
        from public.drafts d where d.job_id = p_job and d.in_scope and d.status <> 'superseded' order by d.created_at, d.id
      loop
        if r.current_version_id is null then
          v_blockers := v_blockers || format('Draft "%s" has no content yet.', r.name);
        elsif not exists (select 1 from public.check_runs where draft_version_id = r.current_version_id) then
          v_blockers := v_blockers || format('Draft "%s": checks have not run on the current version.', r.name);
        elsif not public.version_checks_ok(r.current_version_id) then
          v_blockers := v_blockers || format('Draft "%s" has check blockers without an override.', r.name);
        end if;
      end loop;

    when 'G4' then
      v_label := 'Human approval of every current draft';
      select count(*) into v_count from public.drafts where job_id = p_job and in_scope and status <> 'superseded';
      if v_count = 0 then
        v_blockers := array['There are no in-scope drafts.'];
      end if;
      for r in
        select d.id, coalesce(d.title, d.kind) as name, dv.id as version_id, dv.content_hash, dv.author_id,
               public.draft_last_human_editor(d.id) as last_editor,
               a.decision, a.approver_id as approver, a.content_hash as approved_hash
        from public.drafts d
        left join public.draft_versions dv on dv.id = d.current_version_id
        left join lateral (
          select x.decision, x.approver_id, x.content_hash from public.approvals x
          where x.subject_type = 'draft_version' and x.subject_id = dv.id and x.kind = 'internal' and not x.stale
          order by x.decided_at desc, x.id desc limit 1) a on true
        where d.job_id = p_job and d.in_scope and d.status <> 'superseded' order by d.created_at, d.id
      loop
        if r.version_id is null then
          v_blockers := v_blockers || format('Draft "%s" has no content yet.', r.name);
        elsif r.decision is null then
          v_blockers := v_blockers || format('Draft "%s" is waiting for approval.', r.name);
        elsif r.decision <> 'approved' then
          v_blockers := v_blockers || format('Draft "%s": the latest decision is %s.', r.name, replace(r.decision, '_', ' '));
        elsif r.approved_hash <> r.content_hash then
          v_blockers := v_blockers || format('Draft "%s": the approval does not match the current content.', r.name);
        elsif v_two_person and (r.approver = r.author_id or r.approver = r.last_editor) then
          v_blockers := v_blockers || format('Draft "%s": two-person rule, the approver also wrote it.', r.name);
        end if;
      end loop;
      if j.requires_client_approval and not exists (
           select 1 from public.approvals a
           where a.subject_type = 'bundle' and a.job_id = p_job and a.kind = 'client' and a.decision = 'approved'
             and not a.stale and a.content_hash = public.job_bundle_hash(p_job)) then
        v_blockers := v_blockers || 'Client approval of the bundle is required (the client portal arrives in Phase 7).'::text;
      end if;

    when 'G5' then
      v_label := 'Delivery checklist done and outbox settled';
      select coalesce(array_agg('Not done: ' || (e ->> 'label') order by i), '{}') into v_blockers
      from public.delivery_checklists c, jsonb_array_elements(c.items) with ordinality as x(e, i)
      where c.job_id = p_job and not coalesce((e ->> 'done')::boolean, false);
      select count(*) into v_count from public.outbox_messages where job_id = p_job and status not in ('sent', 'cancelled');
      if v_count > 0 then
        v_blockers := v_blockers || format('%s outbox item(s) are not sent or cancelled.', v_count);
      end if;

    when 'G6' then
      v_label := 'Active subscription (or owner override)';
      if not j.subscription_active then
        v_blockers := array['No active subscription is recorded for this job.'];
      end if;

    else
      raise exception 'Unknown gate %.', p_gate using errcode = '22023';
  end case;

  return jsonb_build_object('gate', p_gate, 'label', v_label, 'passed', cardinality(v_blockers) = 0,
                            'blockers', to_jsonb(v_blockers));
end;
$$;

-- The move graph. Returns the gate for a forward move, 'back', 'close', 'cancel', or null if not allowed.
create or replace function public.job_move_kind(p_from text, p_to text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_from = 'intake'    and p_to = 'audit'     then 'G1'
    when p_from = 'audit'     and p_to = 'drafts'    then 'G2'
    when p_from = 'drafts'    and p_to = 'review'    then 'G3'
    when p_from = 'review'    and p_to = 'approved'  then 'G4'
    when p_from = 'approved'  and p_to = 'delivered' then 'G5'
    when p_from = 'delivered' and p_to = 'upkeep'    then 'G6'
    when p_from in ('review', 'approved') and p_to = 'drafts' then 'back'
    when p_from = 'upkeep'    and p_to = 'audit'     then 're_audit'
    when p_from in ('delivered', 'upkeep') and p_to = 'closed' then 'close'
    when p_from not in ('closed', 'cancelled') and p_to = 'cancelled' then 'cancel'
  end;
$$;

-- What the StageGateBar shows: every gate's status plus the moves the caller may try.
create or replace function public.job_gates(p_job uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  j record;
begin
  select id, org_id, brand_id, stage into j from public.jobs where id = p_job;
  if not found or not public.has_perm(j.org_id, 'jobs.read') or not public.can_brand(j.org_id, j.brand_id) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'stage', j.stage,
    'gates', (select jsonb_agg(public.evaluate_gate(p_job, g) order by g) from unnest(array['G1', 'G2', 'G3', 'G4', 'G5', 'G6']) g),
    'moves', (select coalesce(jsonb_agg(jsonb_build_object('to', s, 'kind', public.job_move_kind(j.stage, s)) order by o), '[]'::jsonb)
              from unnest(array['audit', 'drafts', 'review', 'approved', 'delivered', 'upkeep', 'closed', 'cancelled'])
                   with ordinality as t(s, o)
              where public.job_move_kind(j.stage, s) is not null),
    'can_transition', public.has_perm(j.org_id, 'jobs.transition'),
    'can_cancel', public.auth_role(j.org_id) in ('owner', 'admin'),
    'can_override_g6', public.auth_role(j.org_id) = 'owner');
end;
$$;

create or replace function public.transition_job(p_job uuid, p_to text, p_reason text default null, p_override boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  j record;
  v_kind text;
  v_gate jsonb;
  v_results jsonb := '[]'::jsonb;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_role text;
begin
  select id, org_id, brand_id, stage, reviewer_user_id, title into j from public.jobs where id = p_job for update;
  if not found or not public.can_brand(j.org_id, j.brand_id) or not public.has_perm(j.org_id, 'jobs.transition') then
    raise exception 'Not allowed: moving jobs needs the jobs.transition permission.' using errcode = '42501';
  end if;
  v_role := public.auth_role(j.org_id);
  v_kind := public.job_move_kind(j.stage, p_to);
  if v_kind is null then
    raise exception 'A job can''t move from % to %.', j.stage, p_to using errcode = '22023';
  end if;

  if v_kind = 'cancel' then
    if v_role not in ('owner', 'admin') then
      raise exception 'Only an owner or admin can cancel a job.' using errcode = '42501';
    end if;
    if v_reason is null then
      raise exception 'Give a reason for cancelling.' using errcode = '23514';
    end if;
  elsif v_kind = 'back' then
    if v_reason is null then
      raise exception 'Give a reason for sending the job back to drafts.' using errcode = '23514';
    end if;
  elsif v_kind like 'G_' then
    v_gate := public.evaluate_gate(p_job, v_kind);
    if not (v_gate ->> 'passed')::boolean and v_kind = 'G6' and p_override then
      if v_role <> 'owner' then
        raise exception 'Gate G6 failed: only the owner can override it.' using errcode = '42501';
      end if;
      if v_reason is null then
        raise exception 'Gate G6 failed: an override needs a reason.' using errcode = '23514';
      end if;
      v_gate := v_gate || jsonb_build_object('passed', true, 'override', jsonb_build_object('by', auth.uid(), 'reason', v_reason));
    end if;
    if not (v_gate ->> 'passed')::boolean then
      raise exception 'Gate % failed (% → %): %', v_kind, j.stage, p_to,
        (select string_agg(b, ' ') from jsonb_array_elements_text(v_gate -> 'blockers') b)
        using errcode = 'P0001', hint = (v_gate -> 'blockers')::text;
    end if;
    v_results := jsonb_build_array(v_gate);
  end if;

  update public.jobs set stage = p_to where id = p_job;

  insert into public.job_stage_events (org_id, brand_id, job_id, from_stage, to_stage, actor_id, actor_kind, reason, gate_results)
  values (j.org_id, j.brand_id, p_job, j.stage, p_to, auth.uid(), 'user', v_reason, v_results);

  if p_to = 'delivered' then
    update public.drafts set status = 'delivered' where job_id = p_job and status = 'approved';
  end if;
  if p_to = 'review' and j.reviewer_user_id is not null and j.reviewer_user_id is distinct from auth.uid() then
    insert into public.notifications (org_id, user_id, kind, subject_type, subject_id, payload)
    values (j.org_id, j.reviewer_user_id, 'job_ready_for_review', 'job', p_job, jsonb_build_object('title', j.title));
  end if;

  perform public.emit_event(j.org_id, 'job.transitioned', 'job', p_job,
    jsonb_build_object('from', j.stage, 'to', p_to, 'reason', v_reason, 'gate_results', v_results));
  return jsonb_build_object('from', j.stage, 'to', p_to, 'gate_results', v_results);
end;
$$;

-- ===========================================================================
-- approve_subject: internal approvals of a draft version or an outbox item.
-- ===========================================================================
create or replace function public.approve_subject(p_subject_type text, p_subject_id uuid, p_decision text, p_comment text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_id uuid;
  v_comment text := nullif(trim(coalesce(p_comment, '')), '');
  v_two_person boolean;
  v_last_editor uuid;
begin
  if p_decision not in ('approved', 'rejected', 'changes_requested') then
    raise exception 'Unknown decision %.', p_decision using errcode = '22023';
  end if;
  if p_decision <> 'approved' and v_comment is null then
    raise exception 'Say what needs to change.' using errcode = '23514';
  end if;

  if p_subject_type = 'draft_version' then
    select dv.id, dv.org_id, dv.brand_id, dv.content_hash, dv.author_id, dv.draft_id, d.current_version_id, d.job_id,
           coalesce(d.title, d.kind) as name, j.stage
      into r
    from public.draft_versions dv
    join public.drafts d on d.id = dv.draft_id
    join public.jobs j on j.id = d.job_id
    where dv.id = p_subject_id
    for update of d;
    if not found or not public.can_brand(r.org_id, r.brand_id) or not public.has_perm(r.org_id, 'drafts.approve') then
      raise exception 'Not allowed: approving needs the drafts.approve permission.' using errcode = '42501';
    end if;
    if r.current_version_id is distinct from r.id then
      raise exception 'This is not the current version of the draft.' using errcode = '22023';
    end if;
    if r.stage <> 'review' then
      raise exception 'Drafts are approved while the job is in review (it is in %).', r.stage using errcode = '22023';
    end if;
    if not public.version_checks_ok(r.id) then
      raise exception 'This version has check blockers. Fix them or get an override first.' using errcode = '22023';
    end if;
    v_two_person := public.setting_bool(r.org_id, 'two_person_rule', true);
    v_last_editor := public.draft_last_human_editor(r.draft_id);
    if p_decision = 'approved' and v_two_person and (auth.uid() = r.author_id or auth.uid() = v_last_editor) then
      raise exception 'Two-person rule: someone other than the author must approve this draft.' using errcode = '42501';
    end if;

    insert into public.approvals (org_id, brand_id, job_id, subject_type, subject_id, content_hash, approver_id, approver_role,
                                  kind, decision, comment)
    values (r.org_id, r.brand_id, r.job_id, 'draft_version', r.id, r.content_hash, auth.uid(), public.auth_role(r.org_id),
            'internal', p_decision, v_comment)
    returning id into v_id;

    update public.drafts set status = case when p_decision = 'approved' then 'approved' else 'changes_requested' end
    where id = r.draft_id;

    if p_decision <> 'approved' and v_last_editor is not null and v_last_editor <> auth.uid() then
      insert into public.notifications (org_id, user_id, kind, subject_type, subject_id, payload)
      values (r.org_id, v_last_editor, 'changes_requested', 'job', r.job_id,
              jsonb_build_object('draft', r.name, 'comment', left(v_comment, 200)));
    end if;
    perform public.emit_event(r.org_id, 'approval.decided', 'draft', r.draft_id,
      jsonb_build_object('approval_id', v_id, 'version_id', r.id, 'decision', p_decision));
    return v_id;

  elsif p_subject_type = 'outbox_message' then
    select o.* into r from public.outbox_messages o where o.id = p_subject_id for update;
    if not found or not public.can_brand(r.org_id, r.brand_id) or not public.has_perm(r.org_id, 'drafts.approve') then
      raise exception 'Not allowed: approving needs the drafts.approve permission.' using errcode = '42501';
    end if;
    if r.status <> 'pending_approval' then
      raise exception 'This outbox item is %, not waiting for approval.', r.status using errcode = '22023';
    end if;
    if r.content_hash <> public.outbox_content_hash(r.channel, r.recipient, r.subject, r.body, r.payload) then
      raise exception 'The outbox item''s hash does not match its content.' using errcode = '23514';
    end if;
    v_two_person := public.setting_bool(r.org_id, 'two_person_rule', true);
    if p_decision = 'approved' and v_two_person and (auth.uid() = r.created_by or auth.uid() = r.last_edited_by) then
      raise exception 'Two-person rule: someone other than the author must approve this message.' using errcode = '42501';
    end if;

    insert into public.approvals (org_id, brand_id, job_id, subject_type, subject_id, content_hash, approver_id, approver_role,
                                  kind, decision, comment)
    values (r.org_id, r.brand_id, r.job_id, 'outbox_message', r.id, r.content_hash, auth.uid(), public.auth_role(r.org_id),
            'internal', p_decision, v_comment)
    returning id into v_id;

    if p_decision = 'approved' then
      update public.outbox_messages set status = 'approved', approval_id = v_id where id = r.id;
    end if;
    perform public.emit_event(r.org_id, 'approval.decided', 'outbox_message', r.id,
      jsonb_build_object('approval_id', v_id, 'decision', p_decision));
    return v_id;

  elsif p_subject_type in ('bundle', 'deliverable') then
    raise exception 'Client and deliverable approvals arrive in a later phase.' using errcode = '0A000';
  else
    raise exception 'Unknown subject type %.', p_subject_type using errcode = '22023';
  end if;
end;
$$;

-- ===========================================================================
-- release_outbox: the only way to mark an item sent. Phases 0-2 have no provider:
-- this records a manual send by a human with outbox.release.
-- ===========================================================================
create or replace function public.release_outbox(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  o record;
  a record;
begin
  select * into o from public.outbox_messages where id = p_id for update;
  if not found or not public.can_brand(o.org_id, o.brand_id) or not public.has_perm(o.org_id, 'outbox.release') then
    raise exception 'Not allowed: releasing needs the outbox.release permission.' using errcode = '42501';
  end if;
  if o.status <> 'approved' then
    raise exception 'Only an approved item can be released (this one is %).', o.status using errcode = '22023';
  end if;
  select * into a from public.approvals where id = o.approval_id;
  if not found or a.subject_type <> 'outbox_message' or a.subject_id <> o.id then
    raise exception 'Refused: no approval on record for this item.' using errcode = '22023';
  end if;
  if a.decision <> 'approved' then
    raise exception 'Refused: the approval decision is %.', a.decision using errcode = '22023';
  end if;
  if a.content_hash <> o.content_hash
     or o.content_hash <> public.outbox_content_hash(o.channel, o.recipient, o.subject, o.body, o.payload) then
    raise exception 'Refused: the content hash does not match the approved hash.' using errcode = '22023';
  end if;
  if a.stale then
    raise exception 'Refused: the approval is stale.' using errcode = '22023';
  end if;

  update public.outbox_messages
  set status = 'sent', sent_at = now(), sent_by = auth.uid(), provider_id = 'manual'
  where id = p_id;
  perform public.emit_event(o.org_id, 'outbox.released', 'outbox_message', p_id,
    jsonb_build_object('channel', o.channel, 'approval_id', a.id, 'sender', 'manual'));
end;
$$;

create or replace function public.cancel_outbox(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  o record;
begin
  select id, org_id, brand_id, status into o from public.outbox_messages where id = p_id for update;
  if not found or not public.can_brand(o.org_id, o.brand_id) or not public.has_perm(o.org_id, 'jobs.write') then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if o.status in ('sent', 'cancelled') then
    raise exception 'This item is already %.', o.status using errcode = '22023';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Give a reason for cancelling.' using errcode = '23514';
  end if;
  update public.outbox_messages set status = 'cancelled', block_reason = left(trim(p_reason), 500) where id = p_id;
  perform public.emit_event(o.org_id, 'outbox.cancelled', 'outbox_message', p_id, jsonb_build_object('reason', left(trim(p_reason), 500)));
end;
$$;

-- ===========================================================================
-- Domain events for the new tables (every domain action emits one).
-- ===========================================================================
do $$
declare
  r record;
begin
  for r in select * from (values
    ('client_accounts', 'client_account'), ('jobs', 'job'), ('job_items', 'job_item'), ('audits', 'audit'),
    ('audit_findings', 'audit_finding'), ('drafts', 'draft'), ('draft_versions', 'draft_version'),
    ('outbox_messages', 'outbox_message'), ('deliverables', 'deliverable'), ('check_rules', 'check_rule')
  ) as t(tbl, entity) loop
    execute format('create trigger %1$s_emit_event after insert or update or delete on public.%1$I
                      for each row execute function public.emit_row_event(%2$L)', r.tbl, r.entity);
  end loop;
end;
$$;
