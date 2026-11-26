begin;
\ir _helpers.psql
select plan(7);

-- Make the partner an admin for this test
update memberships set role = 'admin' where user_id = tests.u_partner() and org_id = tests.org_main();

select tests.act_as(tests.u_partner());
select ok(public.has_perm(tests.org_main(), 'members.manage'), 'admin has members.manage');
select ok(not public.has_perm(tests.org_main(), 'org.manage'), 'admin lacks org.manage');
select throws_ok(
  $$ insert into memberships (org_id, user_id, role, status) values (tests.org_main(), tests.u_outsider(), 'owner', 'invited') $$,
  '42501', null, 'admin cannot grant owner');
select throws_ok(
  $$ update memberships set role = 'viewer' where user_id = tests.u_owner() and org_id = tests.org_main() $$,
  '42501', null, 'admin cannot demote the owner');

-- Last active owner cannot be demoted, not even by a server job (service role / no user)
select tests.reset_role();
select throws_ok(
  $$ update memberships set role = 'admin' where user_id = tests.u_owner() and org_id = tests.org_main() $$,
  '23514', null, 'last owner cannot be demoted');

-- Invitations activate on first sign-in
select tests.reset_role();
insert into memberships (org_id, user_id, role, status) values (tests.org_main(), tests.u_outsider(), 'viewer', 'invited');
select tests.act_as(tests.u_outsider());
select is(public.accept_my_invites(), 1, 'accept_my_invites activates the invite');
select is((select count(*) from brands where org_id = tests.org_main()), 2::bigint, 'activated viewer can now read the org');

select tests.reset_role();
select * from finish();
rollback;
