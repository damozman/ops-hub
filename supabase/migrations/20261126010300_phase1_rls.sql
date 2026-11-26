-- Phase 1: grants and RLS. Default deny; explicit grants; anon gets nothing.

revoke all on public.companies, public.contacts, public.consents, public.pipelines, public.pipeline_stages,
  public.deals, public.activities, public.tasks, public.comments, public.notifications, public.events,
  public.forms, public.form_submissions, public.bookings, public.files, public.import_guard_signatures
  from anon, authenticated, service_role, svc_drafts, svc_worker;

-- Functions: trigger functions are not callable; helpers for signed-in users only.
revoke execute on function public.emit_row_event() from public, anon, authenticated;
revoke execute on function public.create_default_pipeline() from public, anon, authenticated;
revoke execute on function public.deal_before_write() from public, anon, authenticated;
revoke execute on function public.deal_stage_changed() from public, anon, authenticated;
revoke execute on function public.comment_notify_mentions() from public, anon, authenticated;
revoke execute on function public.comment_guard_edit() from public, anon, authenticated;
revoke execute on function public.task_before_write() from public, anon, authenticated;
revoke execute on function public.task_notify_assignee() from public, anon, authenticated;
revoke execute on function public.cross_sell_on_deal() from public, anon, authenticated;
revoke execute on function public.cross_sell_on_company() from public, anon, authenticated;
revoke execute on function public.emit_event(uuid, text, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.org_owner_id(uuid) from public, anon, authenticated;
revoke execute on function public.cross_sell_check(uuid) from public, anon, authenticated;
revoke execute on function public.mark_notifications_digested(uuid[]) from public, anon, authenticated;
revoke execute on function public.submit_form(uuid, jsonb, text, boolean, text, int) from public, anon, authenticated;
revoke execute on function public.public_form(uuid) from public, anon, authenticated;
grant execute on function public.submit_form(uuid, jsonb, text, boolean, text, int) to service_role;
grant execute on function public.public_form(uuid) to service_role;
grant execute on function public.mark_notifications_digested(uuid[]) to service_role;
revoke execute on function public.can_any_brand(uuid, uuid[]) from public, anon;
grant execute on function public.can_any_brand(uuid, uuid[]) to authenticated;
revoke execute on function public.import_guard_match(uuid, text[]) from public, anon;
grant execute on function public.import_guard_match(uuid, text[]) to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['companies', 'contacts', 'consents', 'pipelines', 'pipeline_stages', 'deals', 'activities',
    'tasks', 'comments', 'notifications', 'events', 'forms', 'form_submissions', 'bookings', 'files', 'import_guard_signatures'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- Reusable predicate pieces (inlined below for planner friendliness):
--   member  := org_id in (select auth_org_ids())
--   read    := member and has_perm(org_id, 'crm.read')
--   write   := has_perm(org_id, 'crm.write')

-- ---------------------------------------------------------------------------
-- companies (multi-brand via brand_ids)
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.companies to authenticated;
create policy companies_select on public.companies for select to authenticated
  using (org_id in (select public.auth_org_ids()) and public.has_perm(org_id, 'crm.read') and public.can_any_brand(org_id, brand_ids));
create policy companies_insert on public.companies for insert to authenticated
  with check (public.has_perm(org_id, 'crm.write') and public.can_any_brand(org_id, brand_ids));
create policy companies_update on public.companies for update to authenticated
  using (public.has_perm(org_id, 'crm.write') and public.can_any_brand(org_id, brand_ids))
  with check (public.has_perm(org_id, 'crm.write') and public.can_any_brand(org_id, brand_ids));
create policy companies_delete on public.companies for delete to authenticated
  using (public.has_perm(org_id, 'crm.write') and public.can_any_brand(org_id, brand_ids));

-- ---------------------------------------------------------------------------
-- contacts: visible when unattached, or when their company is visible
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.contacts to authenticated;
create policy contacts_select on public.contacts for select to authenticated
  using (
    org_id in (select public.auth_org_ids()) and public.has_perm(org_id, 'crm.read')
    and (company_id is null or exists (select 1 from public.companies c where c.id = contacts.company_id))
  );
create policy contacts_insert on public.contacts for insert to authenticated
  with check (public.has_perm(org_id, 'crm.write'));
create policy contacts_update on public.contacts for update to authenticated
  using (public.has_perm(org_id, 'crm.write') and (company_id is null or exists (select 1 from public.companies c where c.id = contacts.company_id)))
  with check (public.has_perm(org_id, 'crm.write'));
create policy contacts_delete on public.contacts for delete to authenticated
  using (public.has_perm(org_id, 'crm.write') and (company_id is null or exists (select 1 from public.companies c where c.id = contacts.company_id)));

-- ---------------------------------------------------------------------------
-- consents: append-only evidence
-- ---------------------------------------------------------------------------
grant select, insert on public.consents to authenticated;
create policy consents_select on public.consents for select to authenticated
  using (org_id in (select public.auth_org_ids()) and public.has_perm(org_id, 'crm.read'));
create policy consents_insert on public.consents for insert to authenticated
  with check (public.has_perm(org_id, 'crm.write'));

-- ---------------------------------------------------------------------------
-- pipelines / stages / deals (brand-scoped)
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.pipelines, public.pipeline_stages to authenticated;
create policy pipelines_select on public.pipelines for select to authenticated
  using (org_id in (select public.auth_org_ids()) and public.has_perm(org_id, 'crm.read') and public.can_brand(org_id, brand_id));
create policy pipelines_write on public.pipelines for all to authenticated
  using (public.has_perm(org_id, 'settings.manage') and public.can_brand(org_id, brand_id))
  with check (public.has_perm(org_id, 'settings.manage') and public.can_brand(org_id, brand_id));

create policy pipeline_stages_select on public.pipeline_stages for select to authenticated
  using (org_id in (select public.auth_org_ids()) and exists (select 1 from public.pipelines p where p.id = pipeline_stages.pipeline_id));
create policy pipeline_stages_write on public.pipeline_stages for all to authenticated
  using (public.has_perm(org_id, 'settings.manage') and exists (select 1 from public.pipelines p where p.id = pipeline_stages.pipeline_id))
  with check (public.has_perm(org_id, 'settings.manage') and exists (select 1 from public.pipelines p where p.id = pipeline_stages.pipeline_id));

grant select, insert, delete on public.deals to authenticated;
grant update (company_id, contact_id, stage_id, title, value_cents, offer, expected_close, owner_user_id) on public.deals to authenticated;
create policy deals_select on public.deals for select to authenticated
  using (org_id in (select public.auth_org_ids()) and public.has_perm(org_id, 'crm.read') and public.can_brand(org_id, brand_id));
create policy deals_insert on public.deals for insert to authenticated
  with check (public.has_perm(org_id, 'crm.write') and public.can_brand(org_id, brand_id));
create policy deals_update on public.deals for update to authenticated
  using (public.has_perm(org_id, 'crm.write') and public.can_brand(org_id, brand_id))
  with check (public.has_perm(org_id, 'crm.write') and public.can_brand(org_id, brand_id));
create policy deals_delete on public.deals for delete to authenticated
  using (public.has_perm(org_id, 'crm.write') and public.can_brand(org_id, brand_id));

-- ---------------------------------------------------------------------------
-- activities: notes/calls are written by users; stage changes by trigger
-- ---------------------------------------------------------------------------
grant select, insert, delete on public.activities to authenticated;
grant update (body, occurred_at) on public.activities to authenticated;
create policy activities_select on public.activities for select to authenticated
  using (org_id in (select public.auth_org_ids()) and public.has_perm(org_id, 'crm.read'));
create policy activities_insert on public.activities for insert to authenticated
  with check (public.has_perm(org_id, 'crm.write') and kind in ('note', 'call', 'email_logged', 'meeting'));
create policy activities_update on public.activities for update to authenticated
  using (public.has_perm(org_id, 'crm.write') and created_by = auth.uid() and kind <> 'stage_change')
  with check (public.has_perm(org_id, 'crm.write'));
create policy activities_delete on public.activities for delete to authenticated
  using (public.has_perm(org_id, 'crm.write') and created_by = auth.uid() and kind <> 'stage_change');

-- ---------------------------------------------------------------------------
-- tasks (optional brand)
-- ---------------------------------------------------------------------------
grant select, insert, delete on public.tasks to authenticated;
grant update (title, body, assignee_user_id, due_at, status, priority, recurring_rule) on public.tasks to authenticated;
create policy tasks_select on public.tasks for select to authenticated
  using (org_id in (select public.auth_org_ids()) and public.has_perm(org_id, 'crm.read')
         and (brand_id is null or public.can_brand(org_id, brand_id)));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.has_perm(org_id, 'crm.write') and (brand_id is null or public.can_brand(org_id, brand_id)));
create policy tasks_update on public.tasks for update to authenticated
  using (public.has_perm(org_id, 'crm.write') and (brand_id is null or public.can_brand(org_id, brand_id)))
  with check (public.has_perm(org_id, 'crm.write'));
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.has_perm(org_id, 'crm.write') and (brand_id is null or public.can_brand(org_id, brand_id)));

-- ---------------------------------------------------------------------------
-- comments: crm.write to post (viewers can't comment); author edits text
-- ---------------------------------------------------------------------------
grant select, insert, delete on public.comments to authenticated;
grant update (body_md, mentions, resolved_at) on public.comments to authenticated;
create policy comments_select on public.comments for select to authenticated
  using (org_id in (select public.auth_org_ids()) and public.has_perm(org_id, 'crm.read'));
create policy comments_insert on public.comments for insert to authenticated
  with check (public.has_perm(org_id, 'crm.write') and created_by = auth.uid());
create policy comments_update on public.comments for update to authenticated
  using (public.has_perm(org_id, 'crm.write'))
  with check (public.has_perm(org_id, 'crm.write'));
create policy comments_delete on public.comments for delete to authenticated
  using (public.has_perm(org_id, 'crm.write') and created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- notifications: each user sees and marks read only their own
-- ---------------------------------------------------------------------------
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy notifications_select_own on public.notifications for select to authenticated
  using (user_id = auth.uid() and org_id in (select public.auth_org_ids()));
create policy notifications_update_own on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- events: read-only to members with crm.read; written by triggers/functions
-- ---------------------------------------------------------------------------
grant select on public.events to authenticated;
create policy events_select on public.events for select to authenticated
  using (org_id in (select public.auth_org_ids()) and public.has_perm(org_id, 'crm.read'));

-- ---------------------------------------------------------------------------
-- forms / submissions
-- ---------------------------------------------------------------------------
grant select, insert, delete on public.forms to authenticated;
grant update (name, schema, consent_text, consent_text_version, redirect_url, active) on public.forms to authenticated;
create policy forms_select on public.forms for select to authenticated
  using (org_id in (select public.auth_org_ids()) and public.has_perm(org_id, 'crm.read') and public.can_brand(org_id, brand_id));
create policy forms_write on public.forms for all to authenticated
  using (public.has_perm(org_id, 'settings.manage') and public.can_brand(org_id, brand_id))
  with check (public.has_perm(org_id, 'settings.manage') and public.can_brand(org_id, brand_id));

grant select on public.form_submissions to authenticated;
create policy form_submissions_select on public.form_submissions for select to authenticated
  using (org_id in (select public.auth_org_ids()) and public.has_perm(org_id, 'crm.read')
         and exists (select 1 from public.forms f where f.id = form_submissions.form_id));

-- ---------------------------------------------------------------------------
-- bookings (link/notes only in Phase 1)
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.bookings to authenticated;
create policy bookings_select on public.bookings for select to authenticated
  using (org_id in (select public.auth_org_ids()) and public.has_perm(org_id, 'crm.read') and (brand_id is null or public.can_brand(org_id, brand_id)));
create policy bookings_write on public.bookings for all to authenticated
  using (public.has_perm(org_id, 'crm.write') and (brand_id is null or public.can_brand(org_id, brand_id)))
  with check (public.has_perm(org_id, 'crm.write') and (brand_id is null or public.can_brand(org_id, brand_id)) and source = 'link');

-- ---------------------------------------------------------------------------
-- files + storage bucket. client_confidential files need crm.write to read.
-- ---------------------------------------------------------------------------
grant select, insert, delete on public.files to authenticated;
create policy files_select on public.files for select to authenticated
  using (org_id in (select public.auth_org_ids()) and public.has_perm(org_id, 'crm.read')
         and (sensitivity <> 'client_confidential' or public.has_perm(org_id, 'crm.write')));
create policy files_insert on public.files for insert to authenticated
  with check (public.has_perm(org_id, 'crm.write') and uploaded_by = auth.uid());
create policy files_delete on public.files for delete to authenticated
  using (public.has_perm(org_id, 'crm.write'));

insert into storage.buckets (id, name, public, file_size_limit)
values ('org-files', 'org-files', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = 20971520;

create policy org_files_select on storage.objects for select to authenticated
  using (bucket_id = 'org-files'
         and (storage.foldername(name))[1] in (select o::text from public.auth_org_ids() o)
         and public.has_perm(((storage.foldername(name))[1])::uuid, 'crm.read'));
create policy org_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'org-files'
              and (storage.foldername(name))[1] in (select o::text from public.auth_org_ids() o)
              and public.has_perm(((storage.foldername(name))[1])::uuid, 'crm.write'));
create policy org_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'org-files'
         and (storage.foldername(name))[1] in (select o::text from public.auth_org_ids() o)
         and public.has_perm(((storage.foldername(name))[1])::uuid, 'crm.write'));

-- ---------------------------------------------------------------------------
-- import guard signatures: owner/admin manage; operators can't see the headers
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.import_guard_signatures to authenticated;
create policy import_guard_all on public.import_guard_signatures for all to authenticated
  using (public.has_perm(org_id, 'settings.manage'))
  with check (public.has_perm(org_id, 'settings.manage'));

-- ---------------------------------------------------------------------------
-- service_role: server jobs (form intake runs through submit_form)
-- ---------------------------------------------------------------------------
grant select on public.forms, public.notifications, public.profiles, public.memberships to service_role;
grant update (digested_at) on public.notifications to service_role;

-- Realtime for the deals board.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.deals;
  end if;
end;
$$;
