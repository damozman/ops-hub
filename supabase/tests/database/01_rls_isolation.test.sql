begin;
\ir _helpers.psql
select plan(34);

-- ---------------------------------------------------------------------------
-- Outsider (owner of another org) sees nothing of Mosley Ventures (dev)
-- ---------------------------------------------------------------------------
-- A real token row so the api_tokens isolation check isn't trivially empty.
insert into api_tokens (org_id, name, kind, token_hash, expires_at)
values (tests.org_main(), 'jack (test)', 'service:drafts', 'test-hash-1', now() + interval '30 days');

select tests.act_as(tests.u_outsider());
select is((select count(*) from orgs where id = tests.org_main()), 0::bigint, 'outsider: no main org row');
select is((select count(*) from brands where org_id = tests.org_main()), 0::bigint, 'outsider: no main brands');
select is((select count(*) from memberships where org_id = tests.org_main()), 0::bigint, 'outsider: no main memberships');
select is((select count(*) from settings where org_id = tests.org_main()), 0::bigint, 'outsider: no main settings');
select is((select count(*) from audit_log where org_id = tests.org_main()), 0::bigint, 'outsider: no main audit rows');
select is((select count(*) from api_tokens where org_id = tests.org_main()), 0::bigint, 'outsider: no main api tokens');
select is((select count(*) from profiles where user_id = tests.u_owner()), 0::bigint, 'outsider: cannot see main org profiles');
select is((select count(*) from orgs where id = tests.org_other()), 1::bigint, 'outsider: sees own org');

-- ---------------------------------------------------------------------------
-- Owner (with MFA) sees both brands; without MFA sees nothing
-- ---------------------------------------------------------------------------
select tests.act_as(tests.u_owner());
select is((select count(*) from brands where org_id = tests.org_main()), 2::bigint, 'owner aal2: sees both brands');
select is((select count(*) from orgs where id = tests.org_other()), 0::bigint, 'owner: cannot see other org');
select tests.act_as(tests.u_owner(), 'aal1');
select is((select count(*) from brands), 0::bigint, 'owner aal1 (no MFA): sees no brands');
select is((select count(*) from settings), 0::bigint, 'owner aal1 (no MFA): sees no settings');
select ok(public.auth_requires_mfa(), 'owner: auth_requires_mfa() is true');

-- ---------------------------------------------------------------------------
-- Brand-limited member sees only brand 369
-- ---------------------------------------------------------------------------
select tests.act_as(tests.u_brandlimited());
select results_eq('select key from brands order by key', array['369'], 'brand-limited: sees only 369');
select ok(not public.can_brand(tests.org_main(), tests.brand_fpd()), 'brand-limited: can_brand(fpd) is false');

-- ---------------------------------------------------------------------------
-- Client (portal role) sees nothing internal
-- ---------------------------------------------------------------------------
select tests.act_as(tests.u_client());
select is((select count(*) from orgs), 0::bigint, 'client: no orgs');
select is((select count(*) from brands), 0::bigint, 'client: no brands');
select is((select count(*) from settings), 0::bigint, 'client: no settings');
select is((select count(*) from audit_log), 0::bigint, 'client: no audit rows');
select is((select count(*) from memberships where user_id <> tests.u_client()), 0::bigint, 'client: no other memberships');
select is((select count(*) from profiles where user_id <> tests.u_client()), 0::bigint, 'client: no other profiles');
select ok(not public.has_perm(tests.org_main(), 'crm.read'), 'client: no crm.read');

-- ---------------------------------------------------------------------------
-- Viewer (MFA not required for this role) can read but not write
-- ---------------------------------------------------------------------------
select tests.act_as(tests.u_viewer(), 'aal1');
select is((select count(*) from brands where org_id = tests.org_main()), 2::bigint, 'viewer aal1: reads brands');
select throws_ok(
  $$ insert into brands (org_id, key, name) values (tests.org_main(), 'viewerbrand', 'x') $$,
  '42501', null, 'viewer: cannot insert brands');

-- ---------------------------------------------------------------------------
-- Operator (partner) cannot manage members or settings
-- ---------------------------------------------------------------------------
select tests.act_as(tests.u_partner());
select throws_ok(
  $$ insert into memberships (org_id, user_id, role, status) values (tests.org_main(), tests.u_outsider(), 'viewer', 'active') $$,
  '42501', null, 'operator: cannot insert memberships');
update memberships set role = 'admin' where user_id = tests.u_partner() and org_id = tests.org_main();
update settings set value = 'false'::jsonb where org_id = tests.org_main() and key = 'two_person_rule';
select tests.reset_role();
select is((select role from memberships where user_id = tests.u_partner() and org_id = tests.org_main()), 'operator',
  'operator: cannot raise own role');
select is((select value from settings where org_id = tests.org_main() and key = 'two_person_rule'), 'true'::jsonb,
  'operator: cannot change settings');

-- Operator cannot read service tokens; owner can (without the hash)
select tests.act_as(tests.u_partner());
select ok(not public.has_perm(tests.org_main(), 'members.manage'), 'operator: no members.manage');
select is((select count(*) from api_tokens), 0::bigint, 'operator: cannot see api tokens');
select tests.act_as(tests.u_owner());
select is((select count(*) from api_tokens where org_id = tests.org_main()), 1::bigint, 'owner: sees the org api token');

-- ---------------------------------------------------------------------------
-- Owner can manage settings and members
-- ---------------------------------------------------------------------------
select tests.act_as(tests.u_owner());
update settings set value = 'false'::jsonb where org_id = tests.org_main() and key = 'operator_can_approve';
select is((select value from settings where org_id = tests.org_main() and key = 'operator_can_approve'), 'false'::jsonb,
  'owner: can change settings');
select lives_ok(
  $$ insert into memberships (org_id, user_id, role, status) values (tests.org_main(), tests.u_outsider(), 'viewer', 'invited') $$,
  'owner: can invite a member');

-- Setting override is applied to the operator
select tests.act_as(tests.u_partner());
select ok(not public.has_perm(tests.org_main(), 'drafts.approve'), 'operator: approve follows operator_can_approve=false');
select ok(not public.has_perm(tests.org_main(), 'outbox.release'), 'operator: release defaults to off');

select tests.reset_role();
select * from finish();
rollback;
