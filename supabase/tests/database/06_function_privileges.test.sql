begin;
\ir _helpers.psql
select plan(6);

-- Every SECURITY DEFINER function in public that signed-in users may call.
-- Adding one requires updating this list on purpose.
select set_eq(
  $$ select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and has_function_privilege('authenticated', p.oid, 'execute') $$,
  array['accept_my_invites', 'app_audit', 'auth_org_ids', 'auth_requires_mfa', 'auth_role', 'brand_ids_within_caller',
        'can_brand', 'has_perm',
        -- Phase 1
        'can_any_brand', 'import_guard_match'],
  'authenticated can execute only the allow-listed SECURITY DEFINER functions');

select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')),
  0::bigint, 'anon can execute no public function');

select set_eq(
  $$ select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and has_function_privilege('service_role', p.oid, 'execute') $$,
  array['submit_form', 'public_form', 'mark_notifications_digested'],
  'service_role can execute only the server-job functions (lead form intake, notification digest)');

-- New functions start closed: one created after the migrations (as the role that
-- owns migrations) is not executable by anon, authenticated or service_role.
create function public.zz_created_after_migrations() returns int language sql as $$ select 1 $$;

select ok(not has_function_privilege('anon', 'public.zz_created_after_migrations()', 'execute'),
  'a function created after the migrations is not executable by anon');
select ok(not has_function_privilege('authenticated', 'public.zz_created_after_migrations()', 'execute'),
  'a function created after the migrations is not executable by authenticated');
select ok(not has_function_privilege('service_role', 'public.zz_created_after_migrations()', 'execute'),
  'a function created after the migrations is not executable by service_role');

select * from finish();
rollback;
