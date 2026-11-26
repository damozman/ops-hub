begin;
\ir _helpers.psql
select plan(17);

-- ---------------------------------------------------------------------------
-- #3 Brand-limited managers cannot widen brand access
-- ---------------------------------------------------------------------------
-- Make the brand-limited user (369 only) an admin, and add a fresh viewer limited to 369.
update memberships set role = 'admin' where user_id = tests.u_brandlimited() and org_id = tests.org_main();
insert into memberships (id, org_id, user_id, role, brand_ids, status)
values ('50000000-0000-4000-8000-0000000000b1', tests.org_main(), tests.u_outsider(), 'viewer', array[tests.brand_369()], 'active');

select tests.act_as(tests.u_brandlimited());
select throws_ok(
  $$ update memberships set brand_ids = null where id = '50000000-0000-4000-8000-0000000000b1' $$,
  '42501', null, 'brand-limited admin cannot widen a member to all brands');
select throws_ok(
  $$ update memberships set brand_ids = array[tests.brand_fpd()] where id = '50000000-0000-4000-8000-0000000000b1' $$,
  '42501', null, 'brand-limited admin cannot grant a brand they lack');
select lives_ok(
  $$ update memberships set role = 'reviewer' where id = '50000000-0000-4000-8000-0000000000b1' $$,
  'brand-limited admin can still manage a member inside their brands');
select throws_ok(
  $$ update memberships set brand_ids = null where user_id = tests.u_brandlimited() and org_id = tests.org_main() $$,
  '42501', null, 'brand-limited admin cannot widen their own access');
update memberships set role = 'viewer' where user_id = tests.u_partner() and org_id = tests.org_main();
select is((select role from memberships where user_id = tests.u_partner() and org_id = tests.org_main()), 'operator',
  'brand-limited admin cannot edit an all-brands member (row not visible to update)');
select throws_ok(
  $$ insert into memberships (org_id, user_id, role, brand_ids, status) values (tests.org_main(), tests.u_client(), 'viewer', null, 'invited') $$,
  '42501', null, 'brand-limited admin cannot invite with all brands');

-- Nobody changes their own role, even an owner
select tests.act_as(tests.u_owner());
insert into memberships (org_id, user_id, role, status) values (tests.org_main(), tests.u_reviewer(), 'owner', 'active')
  on conflict (org_id, user_id) do update set role = 'owner';
select throws_ok(
  $$ update memberships set role = 'admin' where user_id = tests.u_owner() and org_id = tests.org_main() $$,
  '42501', null, 'owner cannot change their own role (another owner must)');
select tests.act_as(tests.u_reviewer());
select lives_ok(
  $$ update memberships set role = 'admin' where user_id = tests.u_owner() and org_id = tests.org_main() $$,
  'a second owner can change the first owner''s role');

-- ---------------------------------------------------------------------------
-- #4 Service actors are logged as service
-- ---------------------------------------------------------------------------
select tests.reset_role();
create function tests.definer_actor_kind() returns text language sql security definer set search_path = public
  as $$ select public.audit_actor_kind() $$;
grant usage on schema extensions, tests to svc_drafts;
grant execute on all functions in schema extensions, tests to svc_drafts;
select tests.act_as_role('svc_drafts');
select is(tests.definer_actor_kind(), 'service', 'svc_drafts is "service" even inside SECURITY DEFINER code');
select tests.reset_role();
select tests.act_as(tests.u_owner());
select is(tests.definer_actor_kind(), 'user', 'a signed-in user is "user"');
select tests.reset_role();
select is(tests.definer_actor_kind(), 'system', 'migrations / seed are "system"');

-- ---------------------------------------------------------------------------
-- request_id reaches audit_log
-- ---------------------------------------------------------------------------
select set_config('request.headers', '{"x-request-id":"req-test-123"}', true);
select tests.act_as(tests.u_reviewer());
update brands set name = 'First Pass Data' where id = tests.brand_fpd();
select tests.reset_role();
select ok(exists (select 1 from audit_log where subject_type = 'brands' and subject_id = tests.brand_fpd() and request_id = 'req-test-123'),
  'audit row carries the x-request-id header');
select set_config('request.headers', '', true);
select set_config('app.request_id', 'job-456', true);
update brands set name = 'First Pass Data' where id = tests.brand_fpd();
select ok(exists (select 1 from audit_log where subject_type = 'brands' and subject_id = tests.brand_fpd() and request_id = 'job-456'),
  'server jobs can set app.request_id');

-- ---------------------------------------------------------------------------
-- #6 Concurrent owner removal is serialized on the org row
-- ---------------------------------------------------------------------------
select ok(position('for update' in lower(pg_get_functiondef('public.guard_membership_change()'::regprocedure))) > 0,
  'last-owner guard locks the org row');

-- ---------------------------------------------------------------------------
-- #7 Deleting an org works and its audit history survives
-- ---------------------------------------------------------------------------
select lives_ok($$ delete from orgs where id = tests.org_other() $$, 'org delete succeeds');
select ok(exists (select 1 from audit_log where org_id = tests.org_other() and subject_type = 'orgs' and action = 'delete'),
  'audit rows for the deleted org remain, with its org id');
select is((select count(*) from memberships where org_id = tests.org_other()), 0::bigint, 'org memberships cascade away');

select tests.reset_role();
select * from finish();
rollback;
