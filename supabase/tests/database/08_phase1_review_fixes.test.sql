-- Jack's review of PR #3: phone normalization, brand separation, storage,
-- import dedupe, notifications, consent evidence, and missing allow/deny tests.
begin;
\ir _helpers.psql
select plan(67);

create function tests.form_fpd() returns uuid language sql immutable as $$ select '63000000-0000-4000-8000-000000000001'::uuid $$;
create function tests.deal_fpd() returns uuid language sql immutable as $$ select '62000000-0000-4000-8000-000000000001'::uuid $$;
create function tests.deal_369() returns uuid language sql immutable as $$ select '62000000-0000-4000-8000-000000000002'::uuid $$;
create function tests.lonestar() returns uuid language sql immutable as $$ select '60000000-0000-4000-8000-000000000001'::uuid $$;
grant execute on all functions in schema tests to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- #1 Phone numbers typed the normal way
-- ---------------------------------------------------------------------------
select is(public.normalize_phone('(555) 123-4567'), '+15551234567', 'phone: (555) 123-4567 -> +15551234567');
select is(public.normalize_phone('1-817-555-0150'), '+18175550150', 'phone: 11 digits with a leading 1');
select is(public.normalize_phone('+44 20 7946 0958'), '+442079460958', 'phone: international +E.164 kept');
select is(public.normalize_phone('12345'), null, 'phone: junk -> null');

select tests.act_as_role('service_role');
create temp table f1 on commit drop as
  select public.submit_form(tests.form_fpd(), '{"first_name":"Pat","phone":"(555) 123-4567"}', 'ip-phone-1', true, '', 10) as res;
create temp table f2 on commit drop as
  select public.submit_form(tests.form_fpd(), '{"first_name":"Pat","phone":"555.123.4567"}', 'ip-phone-2', false, '', 10) as res;
select tests.reset_role();
select is((select phone_e164 from contacts where id = (select (res ->> 'contact_id')::uuid from f1)), '+15551234567',
  'form: a formatted phone is stored as E.164 (lead kept)');
select is((select (res ->> 'contact_id') from f2), (select (res ->> 'contact_id') from f1), 'form: the same phone typed differently dedupes');
select is((select brand_id from contacts where id = (select (res ->> 'contact_id')::uuid from f1)), tests.brand_fpd(),
  'form: a contact without a company gets the form''s brand');

-- ---------------------------------------------------------------------------
-- #2 Brand separation. Fixtures in FPD (as the superuser), then read as the
-- 369-only user. The FPD contact has no company: it relies on brand_id.
-- ---------------------------------------------------------------------------
insert into contacts (id, org_id, brand_id, first_name, email) values
  ('71000000-0000-4000-8000-000000000001', tests.org_main(), tests.brand_fpd(), 'FPD-only', 'fpd-only@example.test'),
  ('71000000-0000-4000-8000-000000000002', tests.org_main(), tests.brand_369(), '369-only', '369-only@example.test');
insert into consents (org_id, contact_id, email, channel, purpose, status, method, consent_text_version)
values (tests.org_main(), '71000000-0000-4000-8000-000000000001', 'fpd-only@example.test', 'email', 'marketing', 'granted', 'test', 'v1');
insert into activities (org_id, subject_type, subject_id, kind, body) values
  (tests.org_main(), 'deal', tests.deal_fpd(), 'note', 'FPD secret note'),
  (tests.org_main(), 'deal', tests.deal_369(), 'note', '369 note');
insert into comments (org_id, subject_type, subject_id, body_md, created_by)
values (tests.org_main(), 'deal', tests.deal_fpd(), 'FPD secret comment', tests.u_owner());
insert into tasks (org_id, title, subject_type, subject_id) values (tests.org_main(), 'FPD subject task', 'deal', tests.deal_fpd());
insert into bookings (org_id, contact_id, source, booking_url)
values (tests.org_main(), '71000000-0000-4000-8000-000000000001', 'link', 'https://book.example.test/x');
update deals set title = title || ' (edited)' where id = tests.deal_fpd();

select tests.act_as(tests.u_brandlimited());
select is((select count(*) from contacts where id = '71000000-0000-4000-8000-000000000001'), 0::bigint, 'brand: 369 user cannot see an FPD contact without a company');
select is((select count(*) from contacts where id = '71000000-0000-4000-8000-000000000002'), 1::bigint, 'brand: 369 user sees a 369 contact without a company');
select is((select count(*) from consents where email = 'fpd-only@example.test'), 0::bigint, 'brand: 369 user cannot see FPD consents');
select is((select count(*) from activities where subject_id = tests.deal_fpd()), 0::bigint, 'brand: 369 user cannot see FPD deal activity');
select ok((select count(*) from activities where subject_id = tests.deal_369()) >= 1, 'brand: 369 user sees 369 deal activity');
select is((select count(*) from comments where subject_id = tests.deal_fpd()), 0::bigint, 'brand: 369 user cannot see FPD comments');
select is((select count(*) from tasks where title = 'FPD subject task'), 0::bigint, 'brand: 369 user cannot see a brandless task on an FPD deal');
select is((select count(*) from events where subject_id = tests.deal_fpd()), 0::bigint, 'brand: 369 user cannot see FPD deal events');
select is((select count(*) from bookings where booking_url = 'https://book.example.test/x'), 0::bigint, 'brand: 369 user cannot see bookings of FPD contacts');
select throws_ok($$ insert into activities (org_id, subject_type, subject_id, kind, body)
                    values (tests.org_main(), 'deal', tests.deal_fpd(), 'note', 'x') $$,
  '42501', null, 'brand: 369 user cannot add a note to an FPD deal');
select throws_ok($$ insert into comments (org_id, subject_type, subject_id, body_md, created_by)
                    values (tests.org_main(), 'deal', tests.deal_fpd(), 'x', tests.u_brandlimited()) $$,
  '42501', null, 'brand: 369 user cannot comment on an FPD deal');
select throws_ok($$ insert into contacts (org_id, brand_id, first_name) values (tests.org_main(), tests.brand_fpd(), 'x') $$,
  '42501', null, 'brand: 369 user cannot create an FPD contact');
select lives_ok($$ insert into contacts (org_id, brand_id, first_name) values (tests.org_main(), tests.brand_369(), 'mine') $$,
  'brand: 369 user can create a 369 contact without a company');
select tests.reset_role();

select tests.act_as(tests.u_owner());
select is((select count(*) from contacts where id = '71000000-0000-4000-8000-000000000001'), 1::bigint, 'brand: all-brand owner sees the FPD contact');
select ok((select count(*) from events where subject_id = tests.deal_fpd()) >= 1, 'brand: all-brand owner sees FPD events');
select tests.reset_role();

-- ---------------------------------------------------------------------------
-- #6 Notifications only reach people who can see the record
-- ---------------------------------------------------------------------------
select tests.act_as(tests.u_owner());
insert into comments (org_id, subject_type, subject_id, body_md, mentions, created_by)
values (tests.org_main(), 'deal', tests.deal_fpd(), 'cc', array[tests.u_brandlimited(), tests.u_partner()], tests.u_owner());
insert into tasks (org_id, brand_id, title, assignee_user_id) values (tests.org_main(), tests.brand_fpd(), 'FPD assigned', tests.u_brandlimited());
select tests.reset_role();
select is((select count(*) from notifications where user_id = tests.u_brandlimited()), 0::bigint,
  'notify: no mention or assignment for someone who cannot see the record');
select is((select count(*) from notifications where user_id = tests.u_partner() and kind = 'mention'), 1::bigint,
  'notify: the all-brand partner is still notified');

update memberships set status = 'disabled' where user_id = tests.u_partner() and org_id = tests.org_main();
select tests.act_as_role('service_role');
select is((select count(*) from public.notifications_for_digest() where user_id = tests.u_partner()), 0::bigint,
  'digest: skips people whose membership is no longer active');
select ok((select count(*) from public.notifications_for_digest() where user_id = tests.u_owner()) >= 1, 'digest: includes active members');
select tests.reset_role();
update memberships set status = 'active' where user_id = tests.u_partner() and org_id = tests.org_main();

-- ---------------------------------------------------------------------------
-- #3 / #4 Storage and files
-- ---------------------------------------------------------------------------
select tests.act_as(tests.u_owner());
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('org-files', tests.org_main() || '/imports/x.csv', tests.u_owner()::text) $$,
  '42501', null, 'storage: users cannot upload directly (the server uploads after the import guard)');
select throws_ok($$ insert into files (org_id, path, uploaded_by) values (tests.org_main(), tests.org_main() || '/imports/x.csv', tests.u_owner()) $$,
  '42501', null, 'files: users cannot insert files rows directly');
select tests.reset_role();
select is((select allowed_mime_types from storage.buckets where id = 'org-files'), array['text/csv'], 'storage: bucket accepts CSV only');

insert into files (org_id, path, mime, sensitivity, kind) values
  (tests.org_main(), tests.org_main() || '/conf/secret.csv', 'text/csv', 'client_confidential', 'upload'),
  (tests.org_main(), tests.org_main() || '/imports/ok.csv', 'text/csv', 'internal', 'contact_import');
insert into storage.objects (bucket_id, name) values
  ('org-files', tests.org_main() || '/conf/secret.csv'), ('org-files', tests.org_main() || '/imports/ok.csv'),
  ('org-files', tests.org_main() || '/orphan/no-row.csv');

select tests.act_as(tests.u_viewer());
select is((select count(*) from storage.objects where name like '%/conf/secret.csv'), 0::bigint, 'storage: a viewer cannot download a confidential file');
select is((select count(*) from storage.objects where name like '%/imports/ok.csv'), 1::bigint, 'storage: a viewer can read an internal file');
select is((select count(*) from files where sensitivity = 'client_confidential'), 0::bigint, 'files: a viewer cannot see confidential rows');
select tests.reset_role();
select tests.act_as(tests.u_owner());
select is((select count(*) from storage.objects where name like '%/conf/secret.csv'), 1::bigint, 'storage: the owner can read a confidential file');
select is((select count(*) from storage.objects where name like '%/orphan/no-row.csv'), 0::bigint, 'storage: objects without a files row are not readable');
select tests.reset_role();
select tests.act_as(tests.u_outsider());
select is((select count(*) from storage.objects where bucket_id = 'org-files'), 0::bigint, 'storage: an outsider sees nothing');
select tests.reset_role();

-- ---------------------------------------------------------------------------
-- #5 Import dedupes in the database
-- ---------------------------------------------------------------------------
select tests.act_as(tests.u_owner());
create temp table imp on commit drop as select public.import_contacts(tests.org_main(), null, '[
  {"first_name":"New","email":"new-import@example.test","company":"Lone Star Lift & Rack Supply (fictional)"},
  {"first_name":"Dup","email":"DANA@lonestar.example.test"},
  {"first_name":"Dup2","email":"new-import@example.test"},
  {"first_name":"Phone","phone":"(817) 555-0177"},
  {"first_name":"Nothing"}
]'::jsonb) as res;
select is((select res from imp), '{"imported": 2, "duplicates": 2, "invalid": 1, "companies_created": 0}'::jsonb,
  'import: dedupes against existing contacts and within the file, reuses companies by name');
select is((select company_id from contacts where email = 'new-import@example.test'), tests.lonestar(), 'import: links the existing company');
select tests.reset_role();

select tests.act_as(tests.u_brandlimited());
select throws_ok($$ select public.import_contacts(tests.org_main(), null, '[]'::jsonb) $$, '22023', null,
  'import: a brand-limited user must pick a brand');
select is((select public.import_contacts(tests.org_main(), tests.brand_369(), '[{"email":"fpd-only@example.test"}]'::jsonb) ->> 'duplicates'), '1',
  'import: a duplicate the user cannot see is skipped, not an error');
select tests.reset_role();
select tests.act_as(tests.u_viewer());
select throws_ok($$ select public.import_contacts(tests.org_main(), null, '[]'::jsonb) $$, '42501', null, 'import: a viewer cannot import');
select tests.reset_role();

-- ---------------------------------------------------------------------------
-- #7 Consents are kept as evidence
-- ---------------------------------------------------------------------------
select throws_like($$ delete from contacts where id = '71000000-0000-4000-8000-000000000001' $$,
  '%consent records%', 'consent: a contact with consents cannot be deleted');
select lives_ok($$ delete from contacts where id = '71000000-0000-4000-8000-000000000002' $$, 'consent: a contact without consents can be deleted');

-- ---------------------------------------------------------------------------
-- Minor: a completed cross-sell suggestion is not created again
-- ---------------------------------------------------------------------------
update deals set stage_id = (select s.id from pipeline_stages s join pipelines p on p.id = s.pipeline_id
                             where p.brand_id = tests.brand_fpd() and s.name = 'Won')
where id = tests.deal_fpd();
update tasks set status = 'done' where dedupe_key = 'xsell:A->B:' || tests.lonestar();
select is(public.cross_sell_check(tests.lonestar()), 0, 'cross-sell: no repeat after the task is done');

-- ---------------------------------------------------------------------------
-- Missing allow/deny tests from the review
-- ---------------------------------------------------------------------------
select tests.act_as(tests.u_brandlimited());
select is((select count(*) from pipelines where brand_id = tests.brand_fpd()), 0::bigint, 'pipelines: 369 user cannot see the FPD pipeline');
select is((select count(*) from pipeline_stages s join pipelines p on p.id = s.pipeline_id where p.brand_id = tests.brand_fpd()), 0::bigint,
  'stages: 369 user cannot see FPD stages');
select is((select count(*) from form_submissions where form_id = tests.form_fpd()), 0::bigint, 'form_submissions: 369 user cannot see FPD submissions');
select tests.reset_role();

select tests.act_as(tests.u_partner());
select throws_ok($$ insert into forms (org_id, brand_id, name) values (tests.org_main(), tests.brand_fpd(), 'x') $$, '42501', null,
  'forms: an operator cannot create forms');
select throws_ok($$ insert into pipelines (org_id, brand_id, name) values (tests.org_main(), tests.brand_fpd(), 'x') $$, '42501', null,
  'pipelines: an operator cannot create pipelines');
select tests.reset_role();

select tests.act_as(tests.u_viewer());
select throws_ok($$ insert into bookings (org_id, contact_id, source, booking_url)
                    values (tests.org_main(), '61000000-0000-4000-8000-000000000001', 'link', 'https://book.example.test/v') $$,
  '42501', null, 'bookings: a viewer cannot add a booking');
select tests.reset_role();


-- ---------------------------------------------------------------------------
-- Round 2 (A): crm_sees always returns a boolean, so NULL never lets a mention through
-- ---------------------------------------------------------------------------
insert into contacts (id, org_id, first_name) values ('71000000-0000-4000-8000-000000000003', tests.org_main(), 'No company, no brand');
insert into tasks (id, org_id, title) values ('72000000-0000-4000-8000-000000000001', tests.org_main(), 'No brand, no subject, no assignee');
select is(public.crm_sees(tests.u_brandlimited(), tests.org_main(), 'contact', '71000000-0000-4000-8000-000000000003'), false,
  'crm_sees: false (not null) for a brandless contact without a company');
select is(public.crm_sees(tests.u_brandlimited(), tests.org_main(), 'task', '72000000-0000-4000-8000-000000000001'), false,
  'crm_sees: false (not null) for a brandless, subjectless, unassigned task');
select tests.act_as(tests.u_owner());
insert into comments (org_id, subject_type, subject_id, body_md, mentions, created_by) values
  (tests.org_main(), 'contact', '71000000-0000-4000-8000-000000000003', 'secret contact', array[tests.u_brandlimited()], tests.u_owner()),
  (tests.org_main(), 'task', '72000000-0000-4000-8000-000000000001', 'secret task', array[tests.u_brandlimited()], tests.u_owner());
select tests.reset_role();
select is((select count(*) from notifications where user_id = tests.u_brandlimited() and kind = 'mention'), 0::bigint,
  'notify: no mention on a brandless contact or brandless task for a brand-limited user');

-- Round 2 (B): contact-import CSVs are visible to the uploader and all-brand members only
insert into files (id, org_id, path, mime, kind, uploaded_by) values
  ('73000000-0000-4000-8000-000000000001', tests.org_main(), tests.org_main() || '/imports/owner-import.csv', 'text/csv', 'contact_import', tests.u_owner());
insert into storage.objects (bucket_id, name) values ('org-files', tests.org_main() || '/imports/owner-import.csv');
select tests.act_as(tests.u_brandlimited());
select is((select count(*) from files where id = '73000000-0000-4000-8000-000000000001'), 0::bigint, 'files: a 369 user cannot see another user''s contact import');
select is((select count(*) from storage.objects where name like '%/imports/owner-import.csv'), 0::bigint, 'storage: a 369 user cannot download another user''s contact import');
select is((select count(*) from events where subject_type = 'file' and subject_id = '73000000-0000-4000-8000-000000000001'), 0::bigint,
  'events: a 369 user cannot see events for another user''s contact import');
select tests.reset_role();
select tests.act_as(tests.u_owner());
select is((select count(*) from files where id = '73000000-0000-4000-8000-000000000001'), 1::bigint, 'files: the owner sees the contact import');
select is((select count(*) from storage.objects where name like '%/imports/owner-import.csv'), 1::bigint, 'storage: the owner can download the contact import');
select tests.reset_role();

-- Round 2 (F): contacts are updatable only through the listed columns
select tests.act_as(tests.u_owner());
select throws_ok($$ update contacts set org_id = tests.org_other() where id = '61000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'contacts: org_id cannot be updated by users');
select tests.reset_role();

-- Round 2 (G): an org whose contact has consents can still be deleted (cascade)
insert into contacts (id, org_id, first_name, email) values ('71000000-0000-4000-8000-000000000009', tests.org_other(), 'Other', 'other-consent@example.test');
insert into consents (org_id, contact_id, email, channel, purpose, status, method)
values (tests.org_other(), '71000000-0000-4000-8000-000000000009', 'other-consent@example.test', 'email', 'marketing', 'granted', 'test');
select lives_ok($$ delete from orgs where id = tests.org_other() $$, 'org delete: succeeds with a contact that has consents');
select ok(not exists (select 1 from contacts where id = '71000000-0000-4000-8000-000000000009')
          and not exists (select 1 from consents where email = 'other-consent@example.test'),
  'org delete: the contact and its consents are gone');

-- Round 3 (A): Shared companies are an explicit, all-brand-only choice
select tests.act_as(tests.u_brandlimited());
select throws_ok($$ insert into companies (org_id, name, brand_ids) values (tests.org_main(), 'BL shared attempt', null) $$,
  '42501', 'Pick a brand for this company.', 'shared: a brand-limited user cannot create a shared company');
select throws_ok($$ insert into companies (org_id, name, brand_ids) values (tests.org_main(), 'BL empty attempt', '{}') $$,
  '42501', 'Pick a brand for this company.', 'shared: an empty brand list counts as shared too');
select lives_ok($$ insert into companies (org_id, name, brand_ids) values (tests.org_main(), 'BL 369 co', array[tests.brand_369()]) $$,
  'shared: a brand-limited user can create a company in their brand');
select tests.reset_role();
select tests.act_as(tests.u_owner());
select lives_ok($$ insert into companies (id, org_id, name, brand_ids)
                   values ('74000000-0000-4000-8000-000000000001', tests.org_main(), 'Owner shared co', null) $$,
  'shared: an all-brand owner can create a shared company');
select tests.reset_role();
select tests.act_as(tests.u_brandlimited());
select is((select count(*) from companies where id = '74000000-0000-4000-8000-000000000001'), 1::bigint, 'shared: a brand-limited user sees a shared company');
update companies set name = 'Owner shared co (renamed)' where id = '74000000-0000-4000-8000-000000000001';
select is((select name || '|' || coalesce(brand_ids::text, 'null') from companies where id = '74000000-0000-4000-8000-000000000001'),
  'Owner shared co (renamed)|null', 'shared: a brand-limited user can edit a shared company and it stays shared');

-- Round 3 (B): contact-import files can't be deleted by other brands
delete from files where id = '73000000-0000-4000-8000-000000000001';
select tests.reset_role();
select is((select count(*) from files where id = '73000000-0000-4000-8000-000000000001'), 1::bigint,
  'files: a brand-limited user cannot delete another user''s contact import');

select * from finish();
rollback;
