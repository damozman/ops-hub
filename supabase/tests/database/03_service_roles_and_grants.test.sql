begin;
\ir _helpers.psql
select plan(8);

-- svc_drafts and svc_worker have no table privileges in Phases 0-2
select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v', 'p')
      and (has_table_privilege('svc_drafts', c.oid, 'select,insert,update,delete')
        or has_table_privilege('svc_worker', c.oid, 'select,insert,update,delete'))),
  0::bigint, 'svc_drafts / svc_worker hold no privileges on any public table');

-- Test-only (rolled back): let the service roles call pgTAP so we can assert failures as them.
grant usage on schema extensions, tests to svc_drafts, svc_worker;
grant execute on all functions in schema extensions, tests to svc_drafts, svc_worker;

select tests.act_as_role('svc_drafts');
select throws_ok($$ select count(*) from public.orgs $$, '42501', null, 'svc_drafts cannot read orgs');
select throws_ok($$ select count(*) from public.audit_log $$, '42501', null, 'svc_drafts cannot read audit_log');
select tests.reset_role();
select tests.act_as_role('svc_worker');
select throws_ok($$ select count(*) from public.brands $$, '42501', null, 'svc_worker cannot read brands');
select tests.reset_role();

-- anon has nothing
select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v', 'p')
      and has_table_privilege('anon', c.oid, 'select,insert,update,delete')),
  0::bigint, 'anon holds no privileges on any public table');

-- RLS is on for every table, and every table has at least one policy
select is(
  (select count(*) from pg_tables t where t.schemaname = 'public' and not t.rowsecurity),
  0::bigint, 'every public table has RLS enabled');
select is(
  (select count(*) from pg_tables t
    where t.schemaname = 'public'
      and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename)),
  0::bigint, 'every public table has at least one policy');

-- authenticated cannot read token hashes even as owner
select tests.act_as(tests.u_owner());
select throws_ok($$ select token_hash from public.api_tokens $$, '42501', null, 'owner cannot select api_tokens.token_hash');

select tests.reset_role();
select * from finish();
rollback;
