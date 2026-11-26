begin;
\ir _helpers.psql
select plan(18);

-- ---------------------------------------------------------------------------
-- Every insert/update/delete on core tables writes audit_log
-- ---------------------------------------------------------------------------
select tests.act_as(tests.u_owner());

insert into brands (id, org_id, key, name) values ('20000000-0000-4000-8000-0000000000aa', tests.org_main(), 'auditb', 'Audit Brand');
update brands set name = 'Audit Brand 2' where id = '20000000-0000-4000-8000-0000000000aa';
delete from brands where id = '20000000-0000-4000-8000-0000000000aa';

insert into settings (id, org_id, key, value) values ('40000000-0000-4000-8000-0000000000aa', tests.org_main(), 'audit_test', '1'::jsonb);
update settings set value = '2'::jsonb where id = '40000000-0000-4000-8000-0000000000aa';
delete from settings where id = '40000000-0000-4000-8000-0000000000aa';

insert into memberships (id, org_id, user_id, role, status) values ('50000000-0000-4000-8000-0000000000aa', tests.org_main(), tests.u_outsider(), 'viewer', 'invited');
update memberships set role = 'reviewer' where id = '50000000-0000-4000-8000-0000000000aa';
delete from memberships where id = '50000000-0000-4000-8000-0000000000aa';

select tests.reset_role();

select is((select count(*) from audit_log where subject_type = 'brands' and subject_id = '20000000-0000-4000-8000-0000000000aa' and action = 'insert'), 1::bigint, 'brands insert audited');
select is((select count(*) from audit_log where subject_type = 'brands' and subject_id = '20000000-0000-4000-8000-0000000000aa' and action = 'update'), 1::bigint, 'brands update audited');
select is((select count(*) from audit_log where subject_type = 'brands' and subject_id = '20000000-0000-4000-8000-0000000000aa' and action = 'delete'), 1::bigint, 'brands delete audited');
select is((select count(*) from audit_log where subject_type = 'settings' and subject_id = '40000000-0000-4000-8000-0000000000aa'), 3::bigint, 'settings insert/update/delete audited');
select is((select count(*) from audit_log where subject_type = 'memberships' and subject_id = '50000000-0000-4000-8000-0000000000aa'), 3::bigint, 'memberships insert/update/delete audited');

select is(
  (select actor_id from audit_log where subject_type = 'brands' and subject_id = '20000000-0000-4000-8000-0000000000aa' and action = 'insert'),
  tests.u_owner(), 'audit row records the acting user');
select is(
  (select actor_kind from audit_log where subject_type = 'brands' and subject_id = '20000000-0000-4000-8000-0000000000aa' and action = 'insert'),
  'user', 'audit row records actor_kind=user');
select is(
  (select after ->> 'name' from audit_log where subject_type = 'brands' and subject_id = '20000000-0000-4000-8000-0000000000aa' and action = 'update'),
  'Audit Brand 2', 'audit row keeps the after image');
select is(
  (select before ->> 'name' from audit_log where subject_type = 'brands' and subject_id = '20000000-0000-4000-8000-0000000000aa' and action = 'update'),
  'Audit Brand', 'audit row keeps the before image');

-- api_tokens hash never reaches the log
insert into api_tokens (org_id, name, kind, token_hash, expires_at) values (tests.org_main(), 'test', 'service:drafts', 'hash-should-not-leak', now() + interval '30 days');
select ok(
  not exists (select 1 from audit_log where subject_type = 'api_tokens' and (after::text like '%hash-should-not-leak%' or before::text like '%hash-should-not-leak%')),
  'token_hash is stripped from audit rows');

-- ---------------------------------------------------------------------------
-- audit_log is append-only for everyone
-- ---------------------------------------------------------------------------
select throws_ok($$ update audit_log set action = 'x' $$, '42501', null, 'superuser UPDATE on audit_log fails');
select throws_ok($$ delete from audit_log $$, '42501', null, 'superuser DELETE on audit_log fails');
select throws_ok($$ truncate audit_log $$, '42501', null, 'TRUNCATE on audit_log fails');

select tests.act_as(tests.u_owner());
select throws_ok($$ update audit_log set action = 'x' $$, '42501', null, 'owner UPDATE on audit_log fails');
select throws_ok($$ delete from audit_log $$, '42501', null, 'owner DELETE on audit_log fails');
select throws_ok($$ insert into audit_log (actor_kind, action, subject_type) values ('user', 'forged', 'x') $$, '42501', null, 'owner cannot insert audit rows directly');

select tests.act_as_role('service_role');
select throws_ok($$ update audit_log set action = 'x' $$, '42501', null, 'service_role UPDATE on audit_log fails');

-- Operators see only their own audit rows
select tests.reset_role();
select tests.act_as(tests.u_partner());
select is((select count(*) from audit_log where actor_id is distinct from tests.u_partner()), 0::bigint, 'operator sees only own audit rows');

select tests.reset_role();
select * from finish();
rollback;
