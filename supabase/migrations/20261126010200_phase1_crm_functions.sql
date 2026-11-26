-- Phase 1: domain functions and triggers (events, stage changes, mentions,
-- default pipelines, cross-sell suggestions, lead form intake, import guard).

-- ---------------------------------------------------------------------------
-- Brand helper for rows tagged with several brands (companies.brand_ids)
-- ---------------------------------------------------------------------------
create or replace function public.can_any_brand(p_org uuid, p_brand_ids uuid[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select m.brand_ids is null or p_brand_ids is null or m.brand_ids && p_brand_ids
       from public.auth_membership(p_org) m
      where m.id is not null),
    false);
$$;

-- ---------------------------------------------------------------------------
-- Domain events: every insert/update/delete on a domain table writes one.
-- TG_ARGV[0] is the entity name, e.g. 'deal' -> deal.created / deal.updated.
-- ---------------------------------------------------------------------------
create or replace function public.emit_event(p_org uuid, p_type text, p_subject_type text, p_subject_id uuid, p_payload jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.events (org_id, type, subject_type, subject_id, payload, actor_id)
  values (p_org, p_type, p_subject_type, p_subject_id, coalesce(p_payload, '{}'::jsonb), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.emit_row_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record := case when tg_op = 'DELETE' then old else new end;
  v_verb text := case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end;
begin
  -- Skip when the org itself is being deleted (cascade).
  if not exists (select 1 from public.orgs where id = v_row.org_id) then
    return null;
  end if;
  perform public.emit_event(v_row.org_id, tg_argv[0] || '.' || v_verb, tg_argv[0], v_row.id, '{}'::jsonb);
  return null;
end;
$$;

do $$
declare
  r record;
begin
  for r in select * from (values
    ('companies', 'company'), ('contacts', 'contact'), ('consents', 'consent'), ('pipelines', 'pipeline'),
    ('deals', 'deal'), ('activities', 'activity'), ('tasks', 'task'), ('comments', 'comment'),
    ('forms', 'form'), ('bookings', 'booking'), ('files', 'file'), ('import_guard_signatures', 'import_guard')
  ) as t(tbl, entity) loop
    execute format('create trigger %1$s_emit_event after insert or update or delete on public.%1$I
                      for each row execute function public.emit_row_event(%2$L)', r.tbl, r.entity);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Default pipeline for every brand (BUILD_PLAN §4.1)
-- ---------------------------------------------------------------------------
create or replace function public.create_default_pipeline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pipeline uuid;
begin
  insert into public.pipelines (org_id, brand_id, name, created_by)
  values (new.org_id, new.id, 'Sales', new.created_by)
  returning id into v_pipeline;

  insert into public.pipeline_stages (org_id, pipeline_id, name, position, win_probability, outcome, created_by) values
    (new.org_id, v_pipeline, 'New lead', 1, 0.05, 'open', new.created_by),
    (new.org_id, v_pipeline, 'Contacted', 2, 0.15, 'open', new.created_by),
    (new.org_id, v_pipeline, 'Discovery booked', 3, 0.35, 'open', new.created_by),
    (new.org_id, v_pipeline, 'Proposal sent', 4, 0.6, 'open', new.created_by),
    (new.org_id, v_pipeline, 'Won', 5, 1, 'won', new.created_by),
    (new.org_id, v_pipeline, 'Lost', 6, 0, 'lost', new.created_by);
  return new;
end;
$$;

create trigger brands_default_pipeline after insert on public.brands
  for each row execute function public.create_default_pipeline();

-- ---------------------------------------------------------------------------
-- Deals: keep pipeline/stage consistent; stage change -> activity + event
-- ---------------------------------------------------------------------------
create or replace function public.deal_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_stage record;
begin
  select s.pipeline_id, s.outcome, p.brand_id, p.org_id into v_stage
  from public.pipeline_stages s join public.pipelines p on p.id = s.pipeline_id
  where s.id = new.stage_id;
  if v_stage is null or v_stage.org_id <> new.org_id then
    raise exception 'Stage does not belong to this org' using errcode = '23503';
  end if;
  new.pipeline_id := v_stage.pipeline_id;
  if v_stage.brand_id <> new.brand_id then
    raise exception 'Stage belongs to another brand''s pipeline' using errcode = '23514';
  end if;
  new.status := v_stage.outcome;
  return new;
end;
$$;

create trigger deals_before_write before insert or update of stage_id, brand_id on public.deals
  for each row execute function public.deal_before_write();

create or replace function public.deal_stage_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from text;
  v_to text;
begin
  select name into v_from from public.pipeline_stages where id = old.stage_id;
  select name into v_to from public.pipeline_stages where id = new.stage_id;
  insert into public.activities (org_id, subject_type, subject_id, kind, body, created_by)
  values (new.org_id, 'deal', new.id, 'stage_change', format('Stage: %s → %s', v_from, v_to), auth.uid());
  perform public.emit_event(new.org_id, 'deal.stage_changed', 'deal', new.id,
    jsonb_build_object('from_stage_id', old.stage_id, 'to_stage_id', new.stage_id, 'from', v_from, 'to', v_to));
  return null;
end;
$$;

create trigger deals_stage_changed after update of stage_id on public.deals
  for each row when (old.stage_id is distinct from new.stage_id)
  execute function public.deal_stage_changed();

-- ---------------------------------------------------------------------------
-- Comments: @mentions notify only the mentioned, active internal members
-- ---------------------------------------------------------------------------
create or replace function public.comment_notify_mentions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_old uuid[] := case when tg_op = 'UPDATE' then old.mentions else '{}'::uuid[] end;
begin
  foreach v_user in array coalesce(new.mentions, '{}'::uuid[]) loop
    continue when v_user = any (v_old);
    continue when v_user = new.created_by;
    continue when not exists (
      select 1 from public.memberships m
      where m.org_id = new.org_id and m.user_id = v_user and m.status = 'active' and m.role <> 'client');
    insert into public.notifications (org_id, user_id, kind, subject_type, subject_id, payload, created_by)
    values (new.org_id, v_user, 'mention', new.subject_type, new.subject_id,
            jsonb_build_object('comment_id', new.id, 'excerpt', left(new.body_md, 200)), new.created_by);
  end loop;
  return null;
end;
$$;

create trigger comments_notify_mentions after insert or update of mentions on public.comments
  for each row execute function public.comment_notify_mentions();

-- Only the author may edit a comment's text; others with crm.write may resolve it.
create or replace function public.comment_guard_edit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and (new.body_md is distinct from old.body_md or new.mentions is distinct from old.mentions)
     and old.created_by is distinct from auth.uid() then
    raise exception 'Only the author can edit a comment' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger comments_guard_edit before update on public.comments
  for each row execute function public.comment_guard_edit();

-- ---------------------------------------------------------------------------
-- Tasks: assignment notifies the assignee; done sets completed_at
-- ---------------------------------------------------------------------------
create or replace function public.task_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger tasks_before_write before insert or update on public.tasks
  for each row execute function public.task_before_write();

create or replace function public.task_notify_assignee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assignee_user_id is not null
     and new.assignee_user_id is distinct from auth.uid()
     and (tg_op = 'INSERT' or new.assignee_user_id is distinct from old.assignee_user_id) then
    insert into public.notifications (org_id, user_id, kind, subject_type, subject_id, payload, created_by)
    values (new.org_id, new.assignee_user_id, 'task_assigned', 'task', new.id,
            jsonb_build_object('title', new.title, 'due_at', new.due_at), auth.uid());
  end if;
  return null;
end;
$$;

create trigger tasks_notify_assignee after insert or update of assignee_user_id on public.tasks
  for each row execute function public.task_notify_assignee();

-- ---------------------------------------------------------------------------
-- Cross-sell suggestions (BUILD_PLAN §4.1). They create a TASK, never a message.
-- ---------------------------------------------------------------------------
create or replace function public.org_owner_id(p_org uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select user_id from public.memberships
  where org_id = p_org and role = 'owner' and status = 'active'
  order by created_at limit 1;
$$;

create or replace function public.cross_sell_check(p_company uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.companies;
  v_fpd uuid;
  v_369 uuid;
  v_count int := 0;
  v_rows int;
begin
  select * into c from public.companies where id = p_company;
  if c.id is null then
    return 0;
  end if;
  select id into v_fpd from public.brands where org_id = c.org_id and key = 'fpd';
  select id into v_369 from public.brands where org_id = c.org_id and key = '369';

  -- FPD Offer A client with a physical location -> suggest 369 Offer B
  if v_369 is not null and coalesce(trim(c.street_address), '') <> ''
     and exists (select 1 from public.deals d where d.company_id = c.id and d.offer = 'A' and d.status = 'won') then
    insert into public.tasks (org_id, brand_id, title, body, assignee_user_id, subject_type, subject_id, dedupe_key, created_by)
    values (c.org_id, v_369, format('Cross-sell: offer 369 local visibility to %s', c.name),
            'Offer A client with a physical location. Suggest Offer B (local visibility). This is a suggestion; no message was sent.',
            public.org_owner_id(c.org_id), 'company', c.id, 'xsell:A->B:' || c.id, auth.uid())
    on conflict do nothing;
    get diagnostics v_rows = row_count;
    v_count := v_count + v_rows;
  end if;

  -- 369 client that sells products online -> suggest FPD Offer A
  if v_fpd is not null and c.sells_online
     and exists (select 1 from public.deals d where d.company_id = c.id and d.offer = 'B' and d.status = 'won') then
    insert into public.tasks (org_id, brand_id, title, body, assignee_user_id, subject_type, subject_id, dedupe_key, created_by)
    values (c.org_id, v_fpd, format('Cross-sell: offer FPD listing optimization to %s', c.name),
            'Offer B client that sells online. Suggest Offer A (listing optimization). This is a suggestion; no message was sent.',
            public.org_owner_id(c.org_id), 'company', c.id, 'xsell:B->A:' || c.id, auth.uid())
    on conflict do nothing;
    get diagnostics v_rows = row_count;
    v_count := v_count + v_rows;
  end if;
  return v_count;
end;
$$;

create or replace function public.cross_sell_on_deal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_id is not null and new.status = 'won'
     and (tg_op = 'INSERT' or old.status <> 'won' or old.company_id is distinct from new.company_id) then
    perform public.cross_sell_check(new.company_id);
  end if;
  return null;
end;
$$;

-- Fires on any update: status is derived by a BEFORE trigger, so "update of status" wouldn't see it.
create trigger deals_cross_sell after insert or update on public.deals
  for each row execute function public.cross_sell_on_deal();

create or replace function public.cross_sell_on_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.cross_sell_check(new.id);
  return null;
end;
$$;

create trigger companies_cross_sell after update of street_address, sells_online on public.companies
  for each row execute function public.cross_sell_on_company();

-- ---------------------------------------------------------------------------
-- Public lead form intake. Called only by the server route with the service
-- role after Zod validation; never granted to anon.
-- Creates contact (dedupe by email), consent (if ticked), deal, task,
-- notifications and events in one transaction.
-- ---------------------------------------------------------------------------
create or replace function public.submit_form(
  p_form_id uuid,
  p_data jsonb,
  p_ip_hash text,
  p_consent boolean,
  p_honeypot text,
  p_rate_limit_per_min int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  f public.forms;
  v_recent int;
  v_email text := nullif(lower(trim(p_data ->> 'email')), '');
  v_phone text := nullif(trim(p_data ->> 'phone'), '');
  v_contact uuid;
  v_company uuid;
  v_pipeline uuid;
  v_stage uuid;
  v_deal uuid;
  v_task uuid;
  v_sub uuid;
  v_owner uuid;
  v_name text;
  m record;
begin
  if coalesce(p_honeypot, '') <> '' then
    raise exception 'spam_rejected' using errcode = 'P0001';
  end if;

  select * into f from public.forms where id = p_form_id and active;
  if f.id is null then
    raise exception 'form_not_found' using errcode = 'P0002';
  end if;

  if p_ip_hash is not null then
    select count(*) into v_recent from public.form_submissions
    where ip_hash = p_ip_hash and created_at > now() - interval '1 minute';
    if v_recent >= greatest(coalesce(p_rate_limit_per_min, 10), 1) then
      raise exception 'rate_limited' using errcode = 'P0001';
    end if;
  end if;

  if v_email is null and v_phone is null then
    raise exception 'email_or_phone_required' using errcode = '22023';
  end if;

  -- Contact: reuse by email, else by phone, else create.
  select id into v_contact from public.contacts where org_id = f.org_id and v_email is not null and lower(email) = v_email limit 1;
  if v_contact is null and v_phone is not null then
    select id into v_contact from public.contacts where org_id = f.org_id and phone_e164 = v_phone limit 1;
  end if;

  if nullif(trim(p_data ->> 'company'), '') is not null then
    select id into v_company from public.companies
    where org_id = f.org_id and lower(name) = lower(trim(p_data ->> 'company')) limit 1;
    if v_company is null then
      insert into public.companies (org_id, name, brand_ids, lifecycle, source)
      values (f.org_id, trim(p_data ->> 'company'), array[f.brand_id], 'lead', 'form:' || f.name)
      returning id into v_company;
    end if;
  end if;

  if v_contact is null then
    insert into public.contacts (org_id, company_id, first_name, last_name, email, phone_e164, owner_user_id, tags)
    values (f.org_id, v_company, nullif(trim(p_data ->> 'first_name'), ''), nullif(trim(p_data ->> 'last_name'), ''),
            v_email, v_phone, public.org_owner_id(f.org_id), array['form'])
    returning id into v_contact;
  end if;

  if p_consent and f.consent_text is not null then
    if v_email is not null then
      insert into public.consents (org_id, contact_id, email, channel, purpose, status, method, consent_text_version, evidence)
      values (f.org_id, v_contact, v_email, 'email', 'marketing', 'granted', 'web_form', f.consent_text_version,
              jsonb_build_object('form_id', f.id, 'consent_text', f.consent_text, 'ip_hash', p_ip_hash));
    end if;
    if v_phone is not null then
      insert into public.consents (org_id, contact_id, phone_e164, channel, purpose, status, method, consent_text_version, evidence)
      values (f.org_id, v_contact, v_phone, 'sms', 'marketing', 'granted', 'web_form', f.consent_text_version,
              jsonb_build_object('form_id', f.id, 'consent_text', f.consent_text, 'ip_hash', p_ip_hash));
    end if;
  end if;

  select p.id, s.id into v_pipeline, v_stage
  from public.pipelines p join public.pipeline_stages s on s.pipeline_id = p.id
  where p.org_id = f.org_id and p.brand_id = f.brand_id
  order by p.created_at, s.position limit 1;

  v_name := coalesce(nullif(trim(concat_ws(' ', p_data ->> 'first_name', p_data ->> 'last_name')), ''), v_email, v_phone);
  v_owner := public.org_owner_id(f.org_id);

  insert into public.deals (org_id, brand_id, company_id, contact_id, pipeline_id, stage_id, title, owner_user_id)
  values (f.org_id, f.brand_id, v_company, v_contact, v_pipeline, v_stage, format('Lead: %s (%s)', v_name, f.name), v_owner)
  returning id into v_deal;

  insert into public.tasks (org_id, brand_id, title, body, assignee_user_id, due_at, priority, subject_type, subject_id)
  values (f.org_id, f.brand_id, format('Follow up with new lead %s', v_name), left(p_data ->> 'message', 2000),
          v_owner, now() + interval '1 day', 'high', 'deal', v_deal)
  returning id into v_task;

  insert into public.form_submissions (org_id, form_id, data, ip_hash, contact_id, deal_id)
  values (f.org_id, f.id, p_data, p_ip_hash, v_contact, v_deal)
  returning id into v_sub;

  -- Notify owners/admins who can see this brand.
  for m in
    select user_id from public.memberships
    where org_id = f.org_id and status = 'active' and role in ('owner', 'admin')
      and (brand_ids is null or f.brand_id = any (brand_ids))
  loop
    insert into public.notifications (org_id, user_id, kind, subject_type, subject_id, payload)
    values (f.org_id, m.user_id, 'form_submitted', 'deal', v_deal,
            jsonb_build_object('form', f.name, 'name', v_name, 'submission_id', v_sub));
  end loop;

  perform public.emit_event(f.org_id, 'form.submitted', 'form', f.id,
    jsonb_build_object('submission_id', v_sub, 'contact_id', v_contact, 'deal_id', v_deal, 'task_id', v_task, 'consent', p_consent));

  return jsonb_build_object('submission_id', v_sub, 'contact_id', v_contact, 'deal_id', v_deal, 'task_id', v_task,
                            'redirect_url', f.redirect_url);
end;
$$;

-- Public read of what a form needs to render (no org data beyond the form itself).
create or replace function public.public_form(p_form_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id', f.id, 'name', f.name, 'schema', f.schema, 'consent_text', f.consent_text,
                            'brand_name', b.name, 'legal_footer', b.legal_footer)
  from public.forms f join public.brands b on b.id = f.brand_id
  where f.id = p_form_id and f.active;
$$;

-- ---------------------------------------------------------------------------
-- Import guard (BUILD_PLAN §5.6): returns the matching signature label or null.
-- Headers are compared case- and whitespace-insensitively.
-- ---------------------------------------------------------------------------
create or replace function public.import_guard_match(p_org uuid, p_headers text[])
returns text
language sql
stable
security definer
set search_path = public
as $$
  with h as (
    select distinct lower(regexp_replace(trim(x), '\s+', ' ', 'g')) as v from unnest(p_headers) x
  )
  select s.label
  from public.import_guard_signatures s
  where s.org_id = p_org
    and p_org in (select public.auth_org_ids())
    and (
      select count(*)::numeric from unnest(s.header_signature) sig
      where lower(regexp_replace(trim(sig), '\s+', ' ', 'g')) in (select v from h)
    ) / cardinality(s.header_signature) >= s.threshold
  order by s.created_at
  limit 1;
$$;

-- Notification digest support (mailer runs server-side).
create or replace function public.mark_notifications_digested(p_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v int;
begin
  update public.notifications set digested_at = now() where id = any (p_ids) and digested_at is null;
  get diagnostics v = row_count;
  return v;
end;
$$;
