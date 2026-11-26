begin;
\ir _helpers.psql
select plan(41);

create function tests.form_fpd() returns uuid language sql immutable as $$ select '63000000-0000-4000-8000-000000000001'::uuid $$;
grant execute on function tests.form_fpd() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Lead form intake (runs as service_role from the API route)
-- ---------------------------------------------------------------------------
select tests.act_as_role('service_role');
create temp table r on commit drop as
  select public.submit_form(tests.form_fpd(),
    '{"first_name":"Jordan","last_name":"Lead","email":"jordan@lead.example.test","phone":"+18175550199","company":"Fictional Forklift Co","message":"Need help"}',
    'iphash-1', true, '', 10) as res;
select tests.reset_role();

select ok((select (res ->> 'contact_id') is not null from r), 'form: returns a contact');
select is((select count(*) from contacts where email = 'jordan@lead.example.test'), 1::bigint, 'form: creates the contact');
select is((select count(*) from deals where id = (select (res ->> 'deal_id')::uuid from r) and brand_id = tests.brand_fpd()), 1::bigint, 'form: creates a deal in the form''s brand');
select is((select s.name from deals d join pipeline_stages s on s.id = d.stage_id where d.id = (select (res ->> 'deal_id')::uuid from r)), 'New lead', 'form: deal starts at New lead');
select is((select count(*) from tasks where id = (select (res ->> 'task_id')::uuid from r) and assignee_user_id = tests.u_owner()), 1::bigint, 'form: creates a follow-up task for the owner');
select ok((select count(*) from notifications where kind = 'form_submitted' and user_id = tests.u_owner()) >= 1, 'form: notifies the owner');
select is((select count(*) from notifications where kind = 'form_submitted' and user_id = tests.u_partner()), 0::bigint, 'form: does not notify operators');
select is((select count(*) from events where type = 'form.submitted'), 1::bigint, 'form: emits form.submitted');
select ok((select count(*) from events where type in ('contact.created', 'deal.created', 'task.created')) >= 3, 'form: contact/deal/task each emit an event');
select is((select count(*) from consents where contact_id = (select (res ->> 'contact_id')::uuid from r) and consent_text_version = 'fpd-2026-11-v1'), 2::bigint,
  'form: consent ticked -> email + sms consent rows with the text version');

-- No consent -> no consent rows
select tests.act_as_role('service_role');
create temp table r2 on commit drop as
  select public.submit_form(tests.form_fpd(), '{"email":"noconsent@lead.example.test"}', 'iphash-2', false, '', 10) as res;
select tests.reset_role();
select is((select count(*) from consents where contact_id = (select (res ->> 'contact_id')::uuid from r2)), 0::bigint, 'form: no consent -> no consent row');

-- Honeypot and rate limit
select tests.act_as_role('service_role');
select throws_ok($$ select public.submit_form(tests.form_fpd(), '{"email":"bot@spam.example.test"}', 'iphash-3', false, 'http://spam', 10) $$,
  'P0001', 'spam_rejected', 'form: honeypot-filled submit is rejected');
select lives_ok($$ select public.submit_form(tests.form_fpd(), jsonb_build_object('email', 'rate' || g || '@lead.example.test'), 'iphash-rate', false, '', 10) from generate_series(1, 10) g $$,
  'form: 10 submits in a minute are accepted');
select throws_ok($$ select public.submit_form(tests.form_fpd(), '{"email":"rate11@lead.example.test"}', 'iphash-rate', false, '', 10) $$,
  'P0001', 'rate_limited', 'form: the 11th submit in a minute from one IP is rate-limited');
select tests.reset_role();

-- Nobody but the service role can call the intake function
select tests.act_as(tests.u_owner());
select throws_ok($$ select public.submit_form(tests.form_fpd(), '{"email":"x@lead.example.test"}', 'iphash-9', false, '', 10) $$,
  '42501', null, 'form: signed-in users cannot call submit_form directly');
select tests.reset_role();

-- ---------------------------------------------------------------------------
-- @mentions
-- ---------------------------------------------------------------------------
select tests.act_as(tests.u_owner());
insert into comments (org_id, subject_type, subject_id, body_md, mentions, created_by)
values (tests.org_main(), 'company', '60000000-0000-4000-8000-000000000001', 'Hey @Partner can you call them?', array[tests.u_partner()], tests.u_owner());
select tests.reset_role();
select is((select count(*) from notifications where kind = 'mention' and user_id = tests.u_partner()), 1::bigint, 'mention: notifies the mentioned user');
select is((select count(*) from notifications where kind = 'mention' and user_id <> tests.u_partner()), 0::bigint, 'mention: notifies nobody else');

select tests.act_as(tests.u_viewer(), 'aal1');
select throws_ok($$ insert into comments (org_id, subject_type, subject_id, body_md, created_by) values (tests.org_main(), 'company', '60000000-0000-4000-8000-000000000001', 'hi', tests.u_viewer()) $$,
  '42501', null, 'viewer cannot comment');

select tests.act_as(tests.u_partner());
select is((select count(*) from notifications), 1::bigint, 'notifications: partner sees only their own');
select throws_ok($$ update comments set body_md = 'edited by someone else' where created_by = tests.u_owner() $$,
  '42501', null, 'comment: only the author can edit the text');
select tests.act_as(tests.u_owner());
update comments set body_md = 'Hey @Partner can you call them today?' where created_by = tests.u_owner();
select tests.reset_role();
select ok(exists (select 1 from audit_log where subject_type = 'comments' and action = 'update'), 'comment: edits are logged');

-- ---------------------------------------------------------------------------
-- Deal stage change -> activity + event + audit
-- ---------------------------------------------------------------------------
select tests.act_as(tests.u_partner());
update deals set stage_id = (select s.id from pipeline_stages s join pipelines p on p.id = s.pipeline_id where p.brand_id = tests.brand_fpd() and s.name = 'Proposal sent')
where id = '62000000-0000-4000-8000-000000000003';
select tests.reset_role();
select is((select count(*) from activities where subject_id = '62000000-0000-4000-8000-000000000003' and kind = 'stage_change'), 1::bigint, 'stage change writes an activity');
select is((select count(*) from events where subject_id = '62000000-0000-4000-8000-000000000003' and type = 'deal.stage_changed'), 1::bigint, 'stage change writes an event');
select ok(exists (select 1 from audit_log where subject_type = 'deals' and subject_id = '62000000-0000-4000-8000-000000000003' and action = 'update' and actor_id = tests.u_partner()),
  'stage change writes an audit row with the actor');
select throws_ok(
  $$ update deals set stage_id = (select s.id from pipeline_stages s join pipelines p on p.id = s.pipeline_id where p.brand_id = tests.brand_369() and s.name = 'Won') where id = '62000000-0000-4000-8000-000000000003' $$,
  '23514', null, 'a deal cannot move to another brand''s stage');

-- ---------------------------------------------------------------------------
-- Cross-sell creates a TASK only
-- ---------------------------------------------------------------------------
select tests.act_as(tests.u_owner());
update deals set stage_id = (select s.id from pipeline_stages s join pipelines p on p.id = s.pipeline_id where p.brand_id = tests.brand_fpd() and s.name = 'Won')
where id = '62000000-0000-4000-8000-000000000001';
select tests.reset_role();
select is((select status from deals where id = '62000000-0000-4000-8000-000000000001'), 'won', 'moving to Won sets status won');
select is((select count(*) from tasks where dedupe_key = 'xsell:A->B:60000000-0000-4000-8000-000000000001' and brand_id = tests.brand_369()), 1::bigint,
  'cross-sell: Offer A client with a street address gets a 369 task');
select is((select count(*) from tasks where dedupe_key like 'xsell:%60000000-0000-4000-8000-000000000004'), 0::bigint,
  'cross-sell: Offer A client without an address gets no task');
select is((select count(*) from notifications where kind not in ('mention', 'form_submitted', 'task_assigned')), 0::bigint,
  'cross-sell: creates no message of any kind');
select tests.act_as(tests.u_owner());
update companies set street_address = '400 Example Rd' where id = '60000000-0000-4000-8000-000000000004';
select tests.reset_role();
select is((select count(*) from tasks where dedupe_key = 'xsell:A->B:60000000-0000-4000-8000-000000000004'), 1::bigint,
  'cross-sell: adding an address later creates the task once');

-- ---------------------------------------------------------------------------
-- Import guard
-- ---------------------------------------------------------------------------
select tests.act_as(tests.u_owner());
select is(public.import_guard_match(tests.org_main(), array['vendor_item_no', ' EXCH_DEPT ', 'MFR_PART', 'UPC_CODE', 'name']),
  'TEST AAFES-like template', 'import guard: 4 of 5 headers (80%) matches');
select is(public.import_guard_match(tests.org_main(), array['VENDOR_ITEM_NO', 'EXCH_DEPT', 'MFR_PART', 'email']),
  null, 'import guard: 3 of 5 headers (60%) does not match');
select tests.act_as(tests.u_outsider());
select is(public.import_guard_match(tests.org_main(), array['VENDOR_ITEM_NO', 'EXCH_DEPT', 'MFR_PART', 'UPC_CODE', 'RETAIL_PRICE']),
  null, 'import guard: non-members learn nothing');
select tests.act_as(tests.u_partner());
select is((select count(*) from import_guard_signatures), 0::bigint, 'import guard: operators cannot read signatures');

-- ---------------------------------------------------------------------------
-- Brand and org isolation for CRM
-- ---------------------------------------------------------------------------
select tests.act_as(tests.u_brandlimited());
select is((select count(*) from deals where brand_id = tests.brand_fpd()), 0::bigint, 'brand-limited: cannot see FPD deals');
select ok((select count(*) from deals where brand_id = tests.brand_369()) >= 1, 'brand-limited: sees 369 deals');
select is((select count(*) from companies where id = '60000000-0000-4000-8000-000000000004'), 0::bigint, 'brand-limited: cannot see FPD-only companies');
select tests.act_as(tests.u_outsider());
select is((select count(*) from companies where org_id = tests.org_main()) + (select count(*) from contacts where org_id = tests.org_main())
  + (select count(*) from deals where org_id = tests.org_main()) + (select count(*) from tasks where org_id = tests.org_main())
  + (select count(*) from events where org_id = tests.org_main()) + (select count(*) from consents where org_id = tests.org_main())
  + (select count(*) from forms where org_id = tests.org_main()), 0::bigint, 'outsider: sees no CRM rows of the main org');
select tests.act_as(tests.u_client());
select is((select count(*) from companies) + (select count(*) from deals) + (select count(*) from events), 0::bigint, 'client: sees no CRM rows');

-- Append-only
select tests.reset_role();
select throws_ok($$ update consents set status = 'revoked' $$, '42501', null, 'consents are append-only');
select throws_ok($$ delete from events $$, '42501', null, 'events are append-only');

select * from finish();
rollback;
