-- Phase 2 review fixes (Jack's review of PR #5).

-- ===========================================================================
-- Shared helper: what another member (not the caller) may do. Same rules as
-- has_perm() + can_brand(), evaluated for p_user. Internal only.
-- ===========================================================================
create or replace function public.member_can(p_org uuid, p_user uuid, p_brand uuid, p_perm text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m record;
begin
  select role, brand_ids into m from public.memberships
  where org_id = p_org and user_id = p_user and status = 'active' and role <> 'client';
  if not found then
    return false;
  end if;
  if p_brand is not null and m.brand_ids is not null and not (p_brand = any (m.brand_ids)) then
    return false;
  end if;
  if p_perm is null then
    return true;
  end if;
  if exists (select 1 from public.role_permissions rp where rp.role = m.role and rp.permission = p_perm) then
    return true;
  end if;
  if m.role = 'operator' and p_perm = 'drafts.approve' then
    return public.setting_bool(p_org, 'operator_can_approve', true);
  end if;
  if m.role = 'operator' and p_perm = 'outbox.release' then
    return public.setting_bool(p_org, 'operator_can_release', false);
  end if;
  return false;
end;
$$;

-- ===========================================================================
-- #1 Owner-only job flags. subscription_active (G6) and requires_client_approval
-- (G4) change only through set_job_flags(), never through table writes.
-- ===========================================================================
revoke insert (requires_client_approval, subscription_active), update (requires_client_approval, subscription_active)
  on public.jobs from authenticated;

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
      if new.subscription_active or new.requires_client_approval then
        raise exception 'Job flags are set with set_job_flags().' using errcode = '42501';
      end if;
    end if;
    new.stage_changed_at := now();
    return new;
  end if;

  if new.brand_id <> old.brand_id or new.client_account_id <> old.client_account_id or new.org_id <> old.org_id then
    raise exception 'A job''s client account and brand cannot change.' using errcode = '42501';
  end if;
  if public.is_api_role() and (new.subscription_active is distinct from old.subscription_active
                               or new.requires_client_approval is distinct from old.requires_client_approval) then
    raise exception 'Job flags change only through set_job_flags().' using errcode = '42501';
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

-- Null leaves a flag as it is. subscription_active: owner. requires_client_approval: owner or admin.
create or replace function public.set_job_flags(p_job uuid, p_subscription_active boolean default null,
                                                p_requires_client_approval boolean default null, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  j record;
  v_role text;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_sub boolean;
  v_client boolean;
begin
  select id, org_id, brand_id, subscription_active, requires_client_approval into j
  from public.jobs where id = p_job for update;
  if not found or not public.can_brand(j.org_id, j.brand_id) or not public.has_perm(j.org_id, 'jobs.write') then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  v_role := public.auth_role(j.org_id);
  v_sub := coalesce(p_subscription_active, j.subscription_active);
  v_client := coalesce(p_requires_client_approval, j.requires_client_approval);
  if v_sub = j.subscription_active and v_client = j.requires_client_approval then
    return jsonb_build_object('changed', false);
  end if;
  if v_sub <> j.subscription_active and v_role <> 'owner' then
    raise exception 'Only the owner can change the upkeep subscription flag.' using errcode = '42501';
  end if;
  if v_client <> j.requires_client_approval and v_role not in ('owner', 'admin') then
    raise exception 'Only an owner or admin can change whether the client must approve.' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'Give a reason for changing the job''s flags.' using errcode = '23514';
  end if;

  update public.jobs set subscription_active = v_sub, requires_client_approval = v_client where id = p_job;
  perform public.emit_event(j.org_id, 'job.flags_changed', 'job', p_job,
    jsonb_build_object('subscription_active', jsonb_build_object('from', j.subscription_active, 'to', v_sub),
                       'requires_client_approval', jsonb_build_object('from', j.requires_client_approval, 'to', v_client),
                       'reason', v_reason));
  return jsonb_build_object('changed', true, 'subscription_active', v_sub, 'requires_client_approval', v_client);
end;
$$;

-- ===========================================================================
-- #2 Scope changes after approval. kind / job_item_id are fixed once a draft
-- has checked content; in_scope is frozen after delivery, and changing it on
-- an approved job sends the job back to drafts like a content change does.
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
  if (new.kind is distinct from old.kind or new.job_item_id is distinct from old.job_item_id)
     and old.current_version_id is not null then
    raise exception 'This draft''s content was checked against its type and item. Create a new draft instead.'
      using errcode = '42501';
  end if;
  if new.in_scope is distinct from old.in_scope then
    select stage into v_stage from public.jobs where id = new.job_id;
    if v_stage in ('delivered', 'upkeep', 'closed', 'cancelled') then
      raise exception 'Scope is frozen once a job is %. Send the job back to drafts first.', v_stage using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.draft_after_scope_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job record;
  v_stale int;
begin
  if new.in_scope is not distinct from old.in_scope then
    return null;
  end if;
  select id, org_id, brand_id, stage into v_job from public.jobs where id = new.job_id for update;
  if v_job.stage <> 'approved' then
    return null;
  end if;
  update public.approvals set stale = true where not stale and subject_type = 'bundle' and job_id = v_job.id;
  get diagnostics v_stale = row_count;
  update public.jobs set stage = 'drafts' where id = v_job.id;
  insert into public.job_stage_events (org_id, brand_id, job_id, from_stage, to_stage, actor_id, actor_kind, reason, gate_results)
  values (v_job.org_id, v_job.brand_id, v_job.id, 'approved', 'drafts', auth.uid(),
          case when auth.uid() is null then 'system' else 'user' end, 'scope_changed_after_approval',
          jsonb_build_array(jsonb_build_object('gate', 'auto', 'passed', true, 'draft_id', new.id,
                                               'in_scope', new.in_scope, 'approvals_marked_stale', v_stale)));
  perform public.emit_event(v_job.org_id, 'job.transitioned', 'job', v_job.id,
    jsonb_build_object('from', 'approved', 'to', 'drafts', 'reason', 'scope_changed_after_approval'));
  return null;
end;
$$;
create trigger drafts_after_scope_change after update of in_scope on public.drafts
  for each row execute function public.draft_after_scope_change();

-- G5 re-runs G4: nothing unapproved reaches delivered.
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
  v_g4 jsonb;
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
      v_label := 'Approvals still current, delivery checklist done and outbox settled';
      v_g4 := public.evaluate_gate(p_job, 'G4');
      v_blockers := array(select 'Approval: ' || b from jsonb_array_elements_text(v_g4 -> 'blockers') b);
      v_blockers := v_blockers || coalesce((
        select array_agg('Not done: ' || (e ->> 'label') order by i)
        from public.delivery_checklists c, jsonb_array_elements(c.items) with ordinality as x(e, i)
        where c.job_id = p_job and not coalesce((e ->> 'done')::boolean, false)), '{}');
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

-- ===========================================================================
-- #4 Assignee and reviewer must be able to see the job: active, non-client,
-- with the job's brand. The reviewer also needs drafts.approve.
-- ===========================================================================
create or replace function public.job_people_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assignee_user_id is not null
     and (tg_op = 'INSERT' or new.assignee_user_id is distinct from old.assignee_user_id)
     and not public.member_can(new.org_id, new.assignee_user_id, new.brand_id, 'jobs.read') then
    raise exception 'The assignee must be an active team member with access to this job''s brand.' using errcode = '23514';
  end if;
  if new.reviewer_user_id is not null
     and (tg_op = 'INSERT' or new.reviewer_user_id is distinct from old.reviewer_user_id)
     and not public.member_can(new.org_id, new.reviewer_user_id, new.brand_id, 'drafts.approve') then
    raise exception 'The reviewer must be an active team member who can approve drafts for this job''s brand.' using errcode = '23514';
  end if;
  return new;
end;
$$;
-- Runs after jobs_before_write (alphabetical), so brand_id is already filled in on insert.
create trigger jobs_people_guard before insert or update of assignee_user_id, reviewer_user_id on public.jobs
  for each row execute function public.job_people_guard();

-- The review notification also re-checks the reviewer (memberships can change later).
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
  if p_to = 'review' and j.reviewer_user_id is not null and j.reviewer_user_id is distinct from auth.uid()
     and public.member_can(j.org_id, j.reviewer_user_id, j.brand_id, 'drafts.approve') then
    insert into public.notifications (org_id, user_id, kind, subject_type, subject_id, payload)
    values (j.org_id, j.reviewer_user_id, 'job_ready_for_review', 'job', p_job, jsonb_build_object('title', j.title));
  end if;

  perform public.emit_event(j.org_id, 'job.transitioned', 'job', p_job,
    jsonb_build_object('from', j.stage, 'to', p_to, 'reason', v_reason, 'gate_results', v_results));
  return jsonb_build_object('from', j.stage, 'to', p_to, 'gate_results', v_results);
end;
$$;

-- ===========================================================================
-- #5 Acknowledging warnings is enforced here, and recorded on the approval.
-- ===========================================================================
alter table public.approvals add column warnings_acknowledged boolean not null default false;

create or replace function public.version_warning_count(p_version uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select r.warning_count from public.check_runs r
    where r.draft_version_id = p_version
    order by r.created_at desc, r.id desc
    limit 1), 0);
$$;

drop function public.approve_subject(text, uuid, text, text);
create function public.approve_subject(p_subject_type text, p_subject_id uuid, p_decision text, p_comment text default null,
                                       p_ack_warnings boolean default false)
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
  v_warnings int;
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
    v_warnings := public.version_warning_count(r.id);
    if p_decision = 'approved' and v_warnings > 0 and not coalesce(p_ack_warnings, false) then
      raise exception 'This version has % warning(s). Confirm you read them before approving.', v_warnings using errcode = '23514';
    end if;

    insert into public.approvals (org_id, brand_id, job_id, subject_type, subject_id, content_hash, approver_id, approver_role,
                                  kind, decision, comment, warnings_acknowledged)
    values (r.org_id, r.brand_id, r.job_id, 'draft_version', r.id, r.content_hash, auth.uid(), public.auth_role(r.org_id),
            'internal', p_decision, v_comment, p_decision = 'approved' and v_warnings > 0)
    returning id into v_id;

    update public.drafts set status = case when p_decision = 'approved' then 'approved' else 'changes_requested' end
    where id = r.draft_id;

    if p_decision <> 'approved' and v_last_editor is not null and v_last_editor <> auth.uid() then
      insert into public.notifications (org_id, user_id, kind, subject_type, subject_id, payload)
      values (r.org_id, v_last_editor, 'changes_requested', 'job', r.job_id,
              jsonb_build_object('draft', r.name, 'comment', left(v_comment, 200)));
    end if;
    perform public.emit_event(r.org_id, 'approval.decided', 'draft', r.draft_id,
      jsonb_build_object('approval_id', v_id, 'version_id', r.id, 'decision', p_decision,
                         'warnings_acknowledged', p_decision = 'approved' and v_warnings > 0));
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
-- Function privileges (deny by default; see 06_function_privileges).
-- ===========================================================================
revoke execute on function public.member_can(uuid, uuid, uuid, text), public.version_warning_count(uuid),
  public.job_people_guard(), public.draft_after_scope_change(), public.job_before_write(), public.draft_before_write(),
  public.evaluate_gate(uuid, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.set_job_flags(uuid, boolean, boolean, text),
  public.approve_subject(text, uuid, text, text, boolean), public.transition_job(uuid, text, text, boolean)
  from public, anon, service_role;
grant execute on function public.set_job_flags(uuid, boolean, boolean, text),
  public.approve_subject(text, uuid, text, text, boolean), public.transition_job(uuid, text, text, boolean)
  to authenticated;
