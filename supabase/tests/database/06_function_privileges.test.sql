begin;
\ir _helpers.psql
select plan(3);

-- Every SECURITY DEFINER function in public that signed-in users may call.
-- Adding one requires updating this list on purpose.
select set_eq(
  $$ select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and has_function_privilege('authenticated', p.oid, 'execute') $$,
  array['accept_my_invites', 'app_audit', 'auth_org_ids', 'auth_requires_mfa', 'auth_role', 'brand_ids_within_caller',
        'can_brand', 'has_perm'],
  'authenticated can execute only the allow-listed SECURITY DEFINER functions');

select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')),
  0::bigint, 'anon can execute no public function');

select set_eq(
  $$ select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and has_function_privilege('service_role', p.oid, 'execute') $$,
  array[]::text[],
  'service_role has no SECURITY DEFINER functions in Phase 0');

select * from finish();
rollback;
