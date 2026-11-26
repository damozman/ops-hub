-- Phase 1 review fixes (Jack's review of PR #3).

-- ===========================================================================
-- #1 Phone numbers from the public form are normalized to E.164.
-- ===========================================================================
-- Same rules as normalizePhone() in src/lib/csv.ts: +E.164 kept, 10 US digits -> +1..., 11 digits starting 1 -> +...
create or replace function public.normalize_phone(p_raw text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_raw is null or trim(p_raw) = '' then null
    when regexp_replace(trim(p_raw), '[\s().-]', '', 'g') ~ '^\+[1-9][0-9]{6,14}$'
      then regexp_replace(trim(p_raw), '[\s().-]', '', 'g')
    when length(regexp_replace(p_raw, '\D', '', 'g')) = 10 then '+1' || regexp_replace(p_raw, '\D', '', 'g')
    when regexp_replace(p_raw, '\D', '', 'g') ~ '^1[0-9]{10}$' then '+' || regexp_replace(p_raw, '\D', '', 'g')
    else null
  end;
$$;

-- ===========================================================================
-- #2 Brand separation. One rule for every CRM record, used by RLS (for the
-- signed-in user) and by notifications (for the person being notified):
--   all-brand members see everything in the org; a brand-limited member sees a
--   record only when it is tied to one of their brands.
--   deal / pipeline / form .... its brand
--   company ................... brand_ids overlap, or unassigned (brand_ids null, shared)
--   contact ................... its company is visible; without a company, its own brand_id
--   task ...................... its brand; without a brand, its subject; else assignee/creator only
--   activity / comment ........ their subject
--   consent ................... its contact
--   booking ................... its brand; without a brand, its contact
-- ===========================================================================
alter table public.contacts add column brand_id uuid;
alter table public.contacts
  add constraint contacts_brand_fk foreign key (org_id, brand_id) references public.brands (org_id, id) on delete set null (brand_id);
comment on column public.contacts.brand_id is 'Brand for a contact without a company (brand-limited visibility).';

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
    when 'import_guard' then
      return true;  -- org-level guard templates (headers are hidden by their own RLS)
    else
      return false;
  end case;
end;
$$;

-- The signed-in user's view of the same rule (for RLS). No user argument, so it can't probe others.
create or replace function public.auth_sees(p_org uuid, p_type text, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.uid() is not null and public.crm_sees(auth.uid(), p_org, p_type, p_id), false);
$$;

-- companies: a company with no brand is Shared (visible to every brand). Only
-- all-brand members may make one shared; a brand-limited member may keep editing
-- a company that is already shared. Jobs without a user (seed, service) are exempt.
create or replace function public.companies_shared_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.brand_ids is not null and cardinality(new.brand_ids) > 0 then
    return new;
  end if;
  new.brand_ids := null;  -- an empty list means shared too; store it one way
  if auth.uid() is null or public.can_brand(new.org_id, null) then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.brand_ids is null then
    return new;
  end if;
  raise exception 'Pick a brand for this company.' using errcode = '42501';
end;
$$;
create trigger companies_shared_write before insert or update on public.companies
  for each row execute function public.companies_shared_write();

-- contacts: company visible, or (no company) own brand.
drop policy contacts_select on public.contacts;
drop policy contacts_insert on public.contacts;
drop policy contacts_update on public.contacts;
drop policy contacts_delete on public.contacts;
revoke update on public.contacts from authenticated;
grant update (company_id, brand_id, first_name, last_name, email, phone_e164, title, owner_user_id, tags, do_not_contact)
  on public.contacts to authenticated;
create policy contacts_select on public.contacts for select to authenticated
  using (org_id in (select public.auth_org_ids()) and public.has_perm(org_id, 'crm.read')
         and case when company_id is not null then exists (select 1 from public.companies c where c.id = contacts.company_id)
                  else public.can_brand(org_id, brand_id) end);
create policy contacts_insert on public.contacts for insert to authenticated
  with check (public.has_perm(org_id, 'crm.write')
              and case when company_id is not null then exists (select 1 from public.companies c where c.id = contacts.company_id)
                       else public.can_brand(org_id, brand_id) end);
create policy contacts_update on public.contacts for update to authenticated
  using (public.has_perm(org_id, 'crm.write')
         and case when company_id is not null then exists (select 1 from public.companies c where c.id = contacts.company_id)
                  else public.can_brand(org_id, brand_id) end)
  with check (public.has_perm(org_id, 'crm.write')
              and case when company_id is not null then exists (select 1 from public.companies c where c.id = contacts.company_id)
                       else public.can_brand(org_id, brand_id) end);
create policy contacts_delete on public.contacts for delete to authenticated
  using (public.has_perm(org_id, 'crm.write')
         and case when company_id is not null then exists (select 1 from public.companies c where c.id = contacts.company_id)
                  else public.can_brand(org_id, brand_id) end);

-- consents: through the contact.
drop policy consents_select on public.consents;
drop policy consents_insert on public.consents;
create policy consents_select on public.consents for select to authenticated
  using (org_id in (select public.auth_org_ids()) and public.has_perm(org_id, 'crm.read')
         and case when contact_id is not null then exists (select 1 from public.contacts c where c.id = consents.contact_id)
                  else public.can_brand(org_id, null) end);
create policy consents_insert on public.consents for insert to authenticated
  with check (public.has_perm(org_id, 'crm.write')
              and case when contact_id is not null then exists (select 1 from public.contacts c where c.id = consents.contact_id)
                       else public.can_brand(org_id, null) end);

-- activities and comments: through their subject.
drop policy activities_select on public.activities;
drop policy activities_insert on public.activities;
drop policy activities_update on public.activities;
drop policy activities_delete on public.activities;
create policy activities_select on public.activities for select to authenticated
  using (org_id in (select public.auth_org_ids()) and public.has_perm(org_id, 'crm.read')
         and public.auth_sees(org_id, subject_type, subject_id));
create policy activities_insert on public.activities for insert to authenticated
  with check (public.has_perm(org_id, 'crm.write') and kind in ('note', 'call', 'email_logged', 'meeting')
              and public.auth_sees(org_id, subject_type, subject_id));
create policy activities_update on public.activities for update to authenticated
  using (public.has_perm(org_id, 'crm.write') and created_by = auth.uid() and kind <> 'stage_change'
         and public.auth_sees(org_id, subject_type, subject_id))
  with check (public.has_perm(org_id, 'crm.write'));
create policy activities_delete on public.activities for delete to authenticated
  using (public.has_perm(org_id, 'crm.write') and created_by = auth.uid() and kind <> 'stage_change'
         and public.auth_sees(org_id, subject_type, subject_id));

drop policy comments_select on public.comments;
drop policy comments_insert on public.comments;
drop policy comments_update on public.comments;
drop policy comments_delete on public.comments;
create policy comments_select on public.comments for select to authenticated
  using (org_id in (select public.auth_org_ids()) and public.has_perm(org_id, 'crm.read')
         and public.auth_sees(org_id, subject_type, subject_id));
create policy comments_insert on public.comments for insert to authenticated
  with check (public.has_perm(org_id, 'crm.write') and created_by = auth.uid()
              and public.auth_sees(org_id, subject_type, subject_id));
create policy comments_update on public.comments for update to authenticated
  using (public.has_perm(org_id, 'crm.write') and public.auth_sees(org_id, subject_type, subject_id))
  with check (public.has_perm(org_id, 'crm.write'));
create policy comments_delete on public.comments for delete to authenticated
  using (public.has_perm(org_id, 'crm.write') and created_by = auth.uid()
         and public.auth_sees(org_id, subject_type, subject_id));

-- tasks: brand, else subject, else assignee/creator.
drop policy tasks_select on public.tasks;
drop policy tasks_insert on public.tasks;
drop policy tasks_update on public.tasks;
drop policy tasks_delete on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
  using (org_id in (select public.auth_org_ids()) and public.has_perm(org_id, 'crm.read')
         and public.auth_sees(org_id, 'task', id));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.has_perm(org_id, 'crm.write')
              and case when brand_id is not null then public.can_brand(org_id, brand_id)
                       when subject_id is not null then public.auth_sees(org_id, subject_type, subject_id)
                       else auth.uid() in (assignee_user_id, created_by) or public.can_brand(org_id, null) end);
create policy tasks_update on public.tasks for update to authenticated
  using (public.has_perm(org_id, 'crm.write') and public.auth_sees(org_id, 'task', id))
  with check (public.has_perm(org_id, 'crm.write'));
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.has_perm(org_id, 'crm.write') and public.auth_sees(org_id, 'task', id));

-- events: through their subject (events about deleted rows: all-brand members only).
drop policy events_select on public.events;
create policy events_select on public.events for select to authenticated
  using (org_id in (select public.auth_org_ids()) and public.has_perm(org_id, 'crm.read')
         and public.auth_sees(org_id, subject_type, subject_id));

-- bookings: brand, else contact.
drop policy bookings_select on public.bookings;
drop policy bookings_write on public.bookings;
create policy bookings_select on public.bookings for select to authenticated
  using (org_id in (select public.auth_org_ids()) and public.has_perm(org_id, 'crm.read')
         and case when brand_id is not null then public.can_brand(org_id, brand_id)
                  when contact_id is not null then exists (select 1 from public.contacts c where c.id = bookings.contact_id)
                  else public.can_brand(org_id, null) end);
create policy bookings_write on public.bookings for all to authenticated
  using (public.has_perm(org_id, 'crm.write')
         and case when brand_id is not null then public.can_brand(org_id, brand_id)
                  when contact_id is not null then exists (select 1 from public.contacts c where c.id = bookings.contact_id)
                  else public.can_brand(org_id, null) end)
  with check (public.has_perm(org_id, 'crm.write') and source = 'link'
              and case when brand_id is not null then public.can_brand(org_id, brand_id)
                       when contact_id is not null then exists (select 1 from public.contacts c where c.id = bookings.contact_id)
                       else public.can_brand(org_id, null) end);

-- ===========================================================================
-- #3 Import guard can't be bypassed: users never upload to storage or insert
-- files rows directly. The server does both, with the service role, only after
-- the guard check passes. The bucket accepts CSV only (Phase 1's only upload).
-- ===========================================================================
drop policy org_files_insert on storage.objects;
drop policy files_insert on public.files;
revoke insert on public.files from authenticated;
grant select, insert on public.files to service_role;
update storage.buckets set allowed_mime_types = array['text/csv'] where id = 'org-files';

-- Contact-import CSVs contain leads for whichever brands were imported, so only
-- the uploader and all-brand members can see them (storage follows via files RLS).
drop policy files_select on public.files;
create policy files_select on public.files for select to authenticated
  using (org_id in (select public.auth_org_ids()) and public.has_perm(org_id, 'crm.read')
         and (sensitivity <> 'client_confidential' or public.has_perm(org_id, 'crm.write'))
         and (kind <> 'contact_import' or uploaded_by = auth.uid() or public.can_brand(org_id, null)));

drop policy files_delete on public.files;
create policy files_delete on public.files for delete to authenticated
  using (public.has_perm(org_id, 'crm.write')
         and (kind <> 'contact_import' or uploaded_by = auth.uid() or public.can_brand(org_id, null)));

-- #4 Storage reads and deletes go through the matching files row, so its
-- sensitivity rule (client_confidential needs crm.write) applies to downloads too.
drop policy org_files_select on storage.objects;
drop policy org_files_delete on storage.objects;
create policy org_files_select on storage.objects for select to authenticated
  using (bucket_id = 'org-files'
         and exists (select 1 from public.files f where f.bucket = objects.bucket_id and f.path = objects.name));
create policy org_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'org-files'
         and exists (select 1 from public.files f where f.bucket = objects.bucket_id and f.path = objects.name)
         and public.has_perm(((storage.foldername(objects.name))[1])::uuid, 'crm.write'));

-- ===========================================================================
-- #5 Contact import dedupes in the database (no row caps, no RLS blind spots).
-- ===========================================================================
create or replace function public.import_contacts(p_org uuid, p_brand uuid, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope uuid[];
  v_member boolean;
  r jsonb;
  v_email text;
  v_phone text;
  v_company_name text;
  v_company uuid;
  v_id uuid;
  v_imported int := 0;
  v_duplicates int := 0;
  v_invalid int := 0;
  v_companies int := 0;
begin
  if auth.uid() is null or p_org not in (select public.auth_org_ids()) or not public.has_perm(p_org, 'crm.write') then
    raise exception 'Your role can''t import contacts' using errcode = '42501';
  end if;
  select m.brand_ids, true into v_scope, v_member from public.auth_membership(p_org) m where m.id is not null;
  if p_brand is not null and not public.can_brand(p_org, p_brand) then
    raise exception 'Pick one of your brands' using errcode = '42501';
  end if;
  if v_scope is not null and p_brand is null then
    raise exception 'Pick a brand for these contacts' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception 'Too many rows' using errcode = '22023';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_email := nullif(lower(trim(r ->> 'email')), '');
    if v_email is not null and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
      v_email := null;
    end if;
    v_phone := public.normalize_phone(r ->> 'phone');
    if v_email is null and v_phone is null then
      v_invalid := v_invalid + 1;
      continue;
    end if;
    if exists (select 1 from public.contacts c
               where c.org_id = p_org and ((v_email is not null and lower(c.email) = v_email)
                                           or (v_phone is not null and c.phone_e164 = v_phone))) then
      v_duplicates := v_duplicates + 1;
      continue;
    end if;

    v_company := null;
    v_company_name := left(nullif(trim(r ->> 'company'), ''), 200);
    if v_company_name is not null then
      -- Reuse a company the importer can see; otherwise create one in the chosen brand.
      select c.id into v_company from public.companies c
      where c.org_id = p_org and lower(c.name) = lower(v_company_name)
        and (v_scope is null or c.brand_ids is null or c.brand_ids && v_scope)
      order by c.created_at limit 1;
      if v_company is null then
        insert into public.companies (org_id, name, brand_ids, lifecycle, source)
        values (p_org, v_company_name, case when p_brand is null then null else array[p_brand] end, 'lead', 'import')
        returning id into v_company;
        v_companies := v_companies + 1;
      end if;
    end if;

    v_id := null;
    insert into public.contacts (org_id, company_id, brand_id, first_name, last_name, email, phone_e164, title, tags)
    values (p_org, v_company, case when v_company is null then p_brand end,
            left(nullif(trim(r ->> 'first_name'), ''), 100), left(nullif(trim(r ->> 'last_name'), ''), 100),
            v_email, v_phone, left(nullif(trim(r ->> 'title'), ''), 120), array['import'])
    on conflict do nothing
    returning id into v_id;
    if v_id is null then
      v_duplicates := v_duplicates + 1;
    else
      v_imported := v_imported + 1;
    end if;
  end loop;

  return jsonb_build_object('imported', v_imported, 'duplicates', v_duplicates, 'invalid', v_invalid,
                            'companies_created', v_companies);
end;
$$;

-- ===========================================================================
-- #6 Notifications respect access: mentions and assignments only reach people
-- who can see the record; the digest re-checks at send time.
-- ===========================================================================
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
    continue when not coalesce(public.crm_sees(v_user, new.org_id, new.subject_type, new.subject_id), false);
    insert into public.notifications (org_id, user_id, kind, subject_type, subject_id, payload, created_by)
    values (new.org_id, v_user, 'mention', new.subject_type, new.subject_id,
            jsonb_build_object('comment_id', new.id, 'excerpt', left(new.body_md, 200)), new.created_by);
  end loop;
  return null;
end;
$$;

create or replace function public.task_notify_assignee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assignee_user_id is not null
     and new.assignee_user_id is distinct from auth.uid()
     and (tg_op = 'INSERT' or new.assignee_user_id is distinct from old.assignee_user_id)
     and coalesce(public.crm_sees(new.assignee_user_id, new.org_id, 'task', new.id), false) then
    insert into public.notifications (org_id, user_id, kind, subject_type, subject_id, payload, created_by)
    values (new.org_id, new.assignee_user_id, 'task_assigned', 'task', new.id,
            jsonb_build_object('title', new.title, 'due_at', new.due_at), auth.uid());
  end if;
  return null;
end;
$$;

-- Digest source: unread, undigested notifications whose recipient is still an
-- active internal member who can see the record.
create or replace function public.notifications_for_digest(p_limit int default 5000)
returns table (id uuid, user_id uuid, org_id uuid, kind text, payload jsonb, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select n.id, n.user_id, n.org_id, n.kind, n.payload, n.created_at
  from public.notifications n
  join public.memberships m on m.org_id = n.org_id and m.user_id = n.user_id and m.status = 'active' and m.role <> 'client'
  where n.read_at is null and n.digested_at is null
    and (n.subject_id is null or public.crm_sees(n.user_id, n.org_id, n.subject_type, n.subject_id))
  order by n.created_at
  limit greatest(1, least(p_limit, 5000));
$$;

-- ===========================================================================
-- #7 Consents are evidence: a contact with consent records can't be deleted
-- (except when the whole org is deleted). Previously ON DELETE SET NULL
-- collided with the append-only guard.
-- ===========================================================================
alter table public.consents drop constraint consents_contact_id_fkey;
alter table public.consents
  add constraint consents_contact_id_fkey foreign key (contact_id) references public.contacts (id) on delete cascade;

create or replace function public.contact_guard_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Org deletion cascades everything; that is allowed.
  if not exists (select 1 from public.orgs where id = old.org_id) then
    return old;
  end if;
  if exists (select 1 from public.consents where contact_id = old.id) then
    raise exception 'This contact has consent records, which are kept as evidence. Mark the contact "do not contact" instead of deleting it.'
      using errcode = '23503';
  end if;
  return old;
end;
$$;
create trigger contacts_guard_delete before delete on public.contacts
  for each row execute function public.contact_guard_delete();

-- ===========================================================================
-- Minor: cross-sell suggestions are made once per company, even after the
-- task is done or cancelled.
-- ===========================================================================
drop index public.tasks_dedupe_uq;
create unique index tasks_dedupe_uq on public.tasks (org_id, dedupe_key) where dedupe_key is not null;

-- ===========================================================================
-- submit_form: normalized phone, contact brand, and (app side) a rate-limit key
-- even when the IP is unknown.
-- ===========================================================================
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
  v_phone text := public.normalize_phone(p_data ->> 'phone');
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

  -- The app always sends a hash (a shared key when the visitor's IP is unknown).
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
    where org_id = f.org_id and lower(name) = lower(trim(p_data ->> 'company'))
      and (brand_ids is null or f.brand_id = any (brand_ids))
    order by created_at limit 1;
    if v_company is null then
      insert into public.companies (org_id, name, brand_ids, lifecycle, source)
      values (f.org_id, trim(p_data ->> 'company'), array[f.brand_id], 'lead', 'form:' || f.name)
      returning id into v_company;
    end if;
  end if;

  if v_contact is null then
    insert into public.contacts (org_id, company_id, brand_id, first_name, last_name, email, phone_e164, owner_user_id, tags)
    values (f.org_id, v_company, f.brand_id, nullif(trim(p_data ->> 'first_name'), ''), nullif(trim(p_data ->> 'last_name'), ''),
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

-- ===========================================================================
-- Function privileges (deny by default; see 06_function_privileges).
-- ===========================================================================
revoke execute on function public.normalize_phone(text) from public, anon, authenticated, service_role;
revoke execute on function public.crm_sees(uuid, uuid, text, uuid, int) from public, anon, authenticated, service_role;
revoke execute on function public.auth_sees(uuid, text, uuid) from public, anon, service_role;
revoke execute on function public.import_contacts(uuid, uuid, jsonb) from public, anon, service_role;
revoke execute on function public.notifications_for_digest(int) from public, anon, authenticated;
revoke execute on function public.contact_guard_delete() from public, anon, authenticated, service_role;
revoke execute on function public.companies_shared_write() from public, anon, authenticated, service_role;
grant execute on function public.auth_sees(uuid, text, uuid) to authenticated;
grant execute on function public.import_contacts(uuid, uuid, jsonb) to authenticated;
grant execute on function public.notifications_for_digest(int) to service_role;
