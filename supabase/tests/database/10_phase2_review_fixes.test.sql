begin;
\ir _helpers.psql
select plan(67);

-- Phase 2 review fixes (Jack's review of PR #5). All data invented.
create function tests.job_a() returns uuid language sql immutable as $$ select '81000000-0000-4000-8000-000000000001'::uuid $$;
create function tests.job_b() returns uuid language sql immutable as $$ select '81000000-0000-4000-8000-000000000002'::uuid $$;
create function tests.item_a1() returns uuid language sql immutable as $$ select '82000000-0000-4000-8000-000000000001'::uuid $$;
create function tests.item_a2() returns uuid language sql immutable as $$ select '82000000-0000-4000-8000-000000000002'::uuid $$;
create function tests.d1() returns uuid language sql immutable as $$ select '85000000-0000-4000-8000-000000000001'::uuid $$;
create function tests.d2() returns uuid language sql immutable as $$ select '85000000-0000-4000-8000-000000000002'::uuid $$;
grant execute on all functions in schema tests to authenticated, anon, service_role;

create function tests.new_version(p_draft uuid, p_content jsonb) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.draft_versions (org_id, draft_id, content) values (tests.org_main(), p_draft, p_content) returning id into v;
  return v;
end $$;
grant execute on function tests.new_version(uuid, jsonb) to authenticated;

-- ===========================================================================
-- #1 subscription_active / requires_client_approval: owner-only, through set_job_flags()
-- ===========================================================================
select tests.act_as(tests.u_partner());
select throws_ok($$ update jobs set subscription_active = true where id = tests.job_a() $$, '42501', null,
  'flags: an operator cannot set subscription_active directly');
select throws_ok($$ update jobs set requires_client_approval = true where id = tests.job_a() $$, '42501', null,
  'flags: an operator cannot set requires_client_approval directly');
select throws_ok($$ insert into jobs (org_id, client_account_id, offer, title, requires_client_approval)
                    values (tests.org_main(), '80000000-0000-4000-8000-000000000001', 'A', 'x', true) $$, '42501', null,
  'flags: cannot be set on insert either');
select throws_like($$ select public.set_job_flags(tests.job_a(), true, null, 'Client signed upkeep') $$, 'Only the owner%',
  'flags: an operator cannot set subscription_active through the RPC');
select throws_like($$ select public.set_job_flags(tests.job_a(), null, true, 'Client wants to sign off') $$, 'Only an owner or admin%',
  'flags: an operator cannot set requires_client_approval through the RPC');
select tests.act_as(tests.u_viewer());
select throws_ok($$ select public.set_job_flags(tests.job_a(), null, true, 'x') $$, '42501', null, 'flags: a viewer cannot call the RPC');
select tests.act_as(tests.u_brandlimited());
select throws_ok($$ select public.set_job_flags(tests.job_a(), null, true, 'x') $$, '42501', null, 'flags: no access to another brand''s job');
select tests.act_as(tests.u_owner());
select throws_ok($$ update jobs set subscription_active = true where id = tests.job_a() $$, '42501', null,
  'flags: even the owner cannot write the column directly');
select throws_ok($$ select public.set_job_flags(tests.job_a(), true, null, '  ') $$, '23514', null, 'flags: a change needs a reason');
select is((select public.set_job_flags(tests.job_a(), false, false, null) ->> 'changed'), 'false', 'flags: no change needs no reason');
select lives_ok($$ select public.set_job_flags(tests.job_a(), true, true, 'Upkeep signed; client wants to sign off') $$,
  'flags: the owner sets both with a reason');
select tests.reset_role();
select is((select subscription_active::text || '/' || requires_client_approval::text from jobs where id = tests.job_a()), 'true/true',
  'flags: both stored');
select is((select payload ->> 'reason' from events where type = 'job.flags_changed' and subject_id = tests.job_a()),
  'Upkeep signed; client wants to sign off', 'flags: the change emits an event with the reason');
select ok(exists (select 1 from audit_log where subject_type = 'jobs' and subject_id = tests.job_a() and action = 'update'
                  and actor_id = tests.u_owner() and (after ->> 'subscription_active')::boolean),
  'flags: the change is in audit_log');
-- Put job A back for the scope tests.
select tests.act_as(tests.u_owner());
select public.set_job_flags(tests.job_a(), false, false, 'Reset for test');
select tests.reset_role();

-- ===========================================================================
-- #2 Scope / kind / item changes after approval
-- ===========================================================================
update jobs set stage = 'drafts' where id = tests.job_a();
select tests.act_as(tests.u_partner());
insert into drafts (id, org_id, job_id, job_item_id, kind, title) values
  (tests.d1(), tests.org_main(), tests.job_a(), tests.item_a1(), 'listing', 'In scope'),
  (tests.d2(), tests.org_main(), tests.job_a(), tests.item_a2(), 'listing', 'Out of scope');
update drafts set in_scope = false where id = tests.d2();
create temp table sv on commit drop as
  select tests.new_version(tests.d1(), '{"title": "Texas Wildflower Soy Candle, 8 oz"}') as v1,
         tests.new_version(tests.d2(), '{"title": "Cedar & Sage Soy Candle, 12 oz"}') as v2;
grant select on sv to authenticated, service_role;
select tests.act_as_role('service_role');
select public.record_check_run((select v1 from sv), 'r-test', '[]');
select public.record_check_run((select v2 from sv), 'r-test',
  '[{"rule_key": "claims.all_caps", "severity": "warning", "message": "ALL CAPS"}]');
select tests.reset_role();
-- Approve d1 (as the owner, below the API), add a bundle approval, and mark the job approved.
update jobs set stage = 'review' where id = tests.job_a();
select tests.act_as(tests.u_owner());
select public.approve_subject('draft_version', (select v1 from sv), 'approved');
select tests.reset_role();
insert into approvals (org_id, brand_id, job_id, subject_type, subject_id, content_hash, approver_id, approver_role, kind, decision)
values (tests.org_main(), tests.brand_fpd(), tests.job_a(), 'bundle', tests.job_a(), public.job_bundle_hash(tests.job_a()),
        tests.u_client(), 'client', 'client', 'approved');
update jobs set stage = 'approved' where id = tests.job_a();

select tests.act_as(tests.u_partner());
select throws_like($$ update drafts set kind = 'email' where id = tests.d1() $$, '%Create a new draft instead%',
  'scope: kind cannot change once a draft has checked content');
select throws_like($$ update drafts set job_item_id = tests.item_a2() where id = tests.d1() $$, '%Create a new draft instead%',
  'scope: the item cannot change once a draft has checked content');
select lives_ok($$ update drafts set in_scope = true where id = tests.d2() $$, 'scope: an approved job''s scope can still change');
select tests.reset_role();
select is((select stage from jobs where id = tests.job_a()), 'drafts', 'scope: the approved job falls back to drafts');
select is((select reason from job_stage_events where job_id = tests.job_a() order by at desc, created_at desc limit 1),
  'scope_changed_after_approval', 'scope: stage event reason scope_changed_after_approval');
select ok((select bool_and(stale) from approvals where subject_type = 'bundle' and job_id = tests.job_a()),
  'scope: the bundle approval is stale');
select ok((select not bool_or(stale) from approvals where subject_type = 'draft_version' and subject_id = (select v1 from sv)),
  'scope: draft approvals of unchanged content stay current');
select is((select count(*) from events where type = 'job.transitioned' and subject_id = tests.job_a()
           and payload ->> 'reason' = 'scope_changed_after_approval'), 1::bigint, 'scope: emits job.transitioned');

-- A draft without content can change type or item.
select tests.act_as(tests.u_partner());
insert into drafts (org_id, job_id, kind, title) values (tests.org_main(), tests.job_a(), 'listing', 'Empty');
select lives_ok($$ update drafts set kind = 'email' where title = 'Empty' and job_id = tests.job_a() $$,
  'scope: a draft without content can change type');
select tests.reset_role();

-- G5 re-runs G4: the newly in-scope draft (d2) was never approved.
update jobs set stage = 'approved' where id = tests.job_a();
update drafts set in_scope = false where title = 'Empty' and job_id = tests.job_a();
update jobs set stage = 'approved' where id = tests.job_a();
select tests.act_as(tests.u_owner());
select public.set_checklist_item(tests.job_a(), 'delivery', k, true) from unnest(array['backup_taken', 'deliverables_uploaded', 'client_notified']) k;
select throws_like($$ select public.transition_job(tests.job_a(), 'delivered') $$, 'Gate G5 failed%Approval: Draft "Out of scope" is waiting for approval%',
  'G5: refuses when an in-scope draft is not approved');
select tests.reset_role();
select ok(not (public.evaluate_gate(tests.job_a(), 'G5') ->> 'passed')::boolean, 'G5: evaluate_gate shows the G4 blocker');

-- Once delivered, scope is frozen.
update jobs set stage = 'delivered' where id = tests.job_a();
select tests.act_as(tests.u_partner());
select throws_like($$ update drafts set in_scope = false where id = tests.d2() $$, 'Scope is frozen%', 'scope: frozen once delivered');
select tests.reset_role();

-- ===========================================================================
-- #5 Warnings must be acknowledged in the database, and the acknowledgement is stored
-- ===========================================================================
update jobs set stage = 'review' where id = tests.job_a();
select tests.act_as(tests.u_owner());
select throws_ok($$ select public.approve_subject('draft_version', (select v2 from sv), 'approved') $$, '23514', null,
  'warnings: approval without the acknowledgement is refused');
select throws_ok($$ select public.approve_subject('draft_version', (select v2 from sv), 'approved', null, false) $$, '23514', null,
  'warnings: an explicit false is refused');
select lives_ok($$ select public.approve_subject('draft_version', (select v2 from sv), 'changes_requested', 'Fix the caps') $$,
  'warnings: requesting changes needs no acknowledgement');
select lives_ok($$ select public.approve_subject('draft_version', (select v2 from sv), 'approved', null, true) $$,
  'warnings: approval with the acknowledgement passes');
select tests.reset_role();
select is((select warnings_acknowledged from approvals where subject_id = (select v2 from sv) and decision = 'approved'), true,
  'warnings: the acknowledgement is stored on the approval');
select is((select warnings_acknowledged from approvals where subject_id = (select v1 from sv) and decision = 'approved'), false,
  'warnings: a version without warnings stores false');

-- ===========================================================================
-- #4 Assignee and reviewer must have access to the job's brand
-- ===========================================================================
select tests.act_as(tests.u_partner());
select throws_ok($$ update jobs set assignee_user_id = tests.u_brandlimited() where id = tests.job_a() $$, '23514', null,
  'people: a 369-only member cannot be assigned an FPD job');
select throws_ok($$ update jobs set reviewer_user_id = tests.u_brandlimited() where id = tests.job_a() $$, '23514', null,
  'people: a 369-only member cannot review an FPD job');
select throws_ok($$ update jobs set reviewer_user_id = tests.u_viewer() where id = tests.job_a() $$, '23514', null,
  'people: a viewer (no drafts.approve) cannot be the reviewer');
select throws_ok($$ update jobs set reviewer_user_id = tests.u_client() where id = tests.job_a() $$, '23514', null,
  'people: a client cannot be the reviewer');
select throws_ok($$ update jobs set assignee_user_id = tests.u_client() where id = tests.job_a() $$, '23514', null,
  'people: a client cannot be the assignee');
select throws_ok($$ update jobs set assignee_user_id = tests.u_outsider() where id = tests.job_a() $$, '23514', null,
  'people: someone from another org cannot be the assignee');
select throws_ok($$ insert into jobs (org_id, client_account_id, offer, title, reviewer_user_id)
                    values (tests.org_main(), '80000000-0000-4000-8000-000000000001', 'A', 'x', tests.u_brandlimited()) $$, '23514', null,
  'people: checked on insert too');
select lives_ok($$ update jobs set reviewer_user_id = tests.u_reviewer(), assignee_user_id = tests.u_viewer() where id = tests.job_a() $$,
  'people: a reviewer can review; a viewer can be the assignee');
select lives_ok($$ update jobs set assignee_user_id = tests.u_brandlimited(), reviewer_user_id = tests.u_brandlimited() where id = tests.job_b() $$,
  'people: a 369-only operator can be assigned and review the 369 job');
select lives_ok($$ update jobs set title = title where id = tests.job_a() $$, 'people: other edits are not blocked');
select tests.reset_role();
update memberships set status = 'disabled' where user_id = tests.u_reviewer() and org_id = tests.org_main();
select tests.act_as(tests.u_partner());
select throws_ok($$ update jobs set reviewer_user_id = tests.u_reviewer() where id = tests.job_b() $$, '23514', null,
  'people: a disabled member cannot be the reviewer');
select tests.reset_role();
update memberships set status = 'active' where user_id = tests.u_reviewer() and org_id = tests.org_main();

-- ===========================================================================
-- #6 Denied access on the remaining Phase 2 tables
-- ===========================================================================
-- Fixtures: an audit with a finding, a deliverable, a check result on job A (FPD).
select tests.act_as(tests.u_partner());
insert into audits (org_id, job_id) values (tests.org_main(), tests.job_a());
insert into audit_findings (org_id, audit_id, severity, message)
  select tests.org_main(), id, 'minor', 'Fixture finding' from audits where job_id = tests.job_a();
insert into deliverables (org_id, job_id, kind) values (tests.org_main(), tests.job_a(), 'Flat file');
select tests.reset_role();
create temp table fx on commit drop as select id as audit_id from audits where job_id = tests.job_a();
grant select on fx to authenticated;

-- client_accounts writes
select tests.act_as(tests.u_viewer());
select throws_ok($$ insert into client_accounts (org_id, brand_id, company_id) values (tests.org_main(), tests.brand_fpd(), '60000000-0000-4000-8000-000000000004') $$,
  '42501', null, 'client_accounts: a viewer cannot create');
update client_accounts set status = 'paused' where id = '80000000-0000-4000-8000-000000000001';
select tests.act_as(tests.u_brandlimited());
select throws_ok($$ insert into client_accounts (org_id, brand_id, company_id) values (tests.org_main(), tests.brand_fpd(), '60000000-0000-4000-8000-000000000004') $$,
  '42501', null, 'client_accounts: a 369-only operator cannot create an FPD account');
update client_accounts set status = 'closed' where id = '80000000-0000-4000-8000-000000000001';
select is((select count(*) from client_accounts where id = '80000000-0000-4000-8000-000000000001'), 0::bigint,
  'client_accounts: a 369-only operator cannot see the FPD account');
select tests.act_as(tests.u_partner());
select throws_ok($$ update client_accounts set company_id = '60000000-0000-4000-8000-000000000001' where id = '80000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'client_accounts: company is not editable');
select tests.reset_role();
select is((select status from client_accounts where id = '80000000-0000-4000-8000-000000000001'), 'active',
  'client_accounts: viewer and other-brand updates changed nothing');

-- job_items, audits, audit_findings, deliverables: other brand and read-only roles
select tests.act_as(tests.u_brandlimited());
select throws_ok($$ insert into job_items (org_id, job_id, kind, title) values (tests.org_main(), tests.job_a(), 'listing', 'x') $$,
  '42501', null, 'job_items: a 369-only operator cannot add to the FPD job');
update job_items set title = 'hijacked' where job_id = tests.job_a();
delete from job_items where job_id = tests.job_a();
select throws_ok($$ insert into audits (org_id, job_id) values (tests.org_main(), tests.job_a()) $$, '42501', null,
  'audits: a 369-only operator cannot start an FPD audit');
select throws_ok($$ insert into audit_findings (org_id, audit_id, severity, message)
                    select tests.org_main(), audit_id, 'minor', 'x' from fx $$,
  '42501', null, 'audit_findings: cannot add to an audit you cannot see');
update audit_findings set message = 'hijacked';
delete from audit_findings;
select throws_ok($$ insert into deliverables (org_id, job_id, kind) values (tests.org_main(), tests.job_a(), 'x') $$, '42501', null,
  'deliverables: a 369-only operator cannot add to the FPD job');
update deliverables set kind = 'hijacked';
select is((select count(*) from job_items where job_id = tests.job_a())
        + (select count(*) from audits where job_id = tests.job_a())
        + (select count(*) from audit_findings)
        + (select count(*) from deliverables where job_id = tests.job_a())
        + (select count(*) from delivery_checklists where job_id = tests.job_a())
        + (select count(*) from check_results), 0::bigint,
  'rls: a 369-only operator sees no FPD job items, audits, findings, deliverables, delivery checklists or check results');
select tests.act_as(tests.u_viewer());
select throws_ok($$ insert into job_items (org_id, job_id, kind, title) values (tests.org_main(), tests.job_b(), 'listing', 'x') $$,
  '42501', null, 'job_items: a viewer cannot add');
select throws_ok($$ insert into audits (org_id, job_id) values (tests.org_main(), tests.job_b()) $$, '42501', null, 'audits: a viewer cannot start one');
select throws_ok($$ insert into deliverables (org_id, job_id, kind) values (tests.org_main(), tests.job_b(), 'x') $$, '42501', null,
  'deliverables: a viewer cannot add');
update audit_findings set message = 'viewer edit';
select tests.reset_role();
select is((select count(*) from job_items where job_id = tests.job_a() and title = 'hijacked')
        + (select count(*) from audit_findings where message in ('hijacked', 'viewer edit'))
        + (select count(*) from deliverables where kind = 'hijacked'), 0::bigint,
  'rls: denied updates changed nothing');
select ok((select count(*) from job_items where job_id = tests.job_a()) >= 3 and (select count(*) from audit_findings) = 1,
  'rls: denied deletes removed nothing');

-- delivery_checklists and check_results are function-only, for every role
select tests.act_as(tests.u_owner());
select throws_ok($$ update delivery_checklists set items = '[]' where job_id = tests.job_a() $$, '42501', null,
  'delivery_checklists: the owner cannot write directly');
select throws_ok($$ insert into delivery_checklists (org_id, brand_id, job_id, items) values (tests.org_main(), tests.brand_fpd(), tests.job_b(), '[]') $$,
  '42501', null, 'delivery_checklists: no direct insert');
select throws_ok($$ update check_results set override_reason = 'x' $$, '42501', null, 'check_results: the owner cannot write directly');
select throws_ok($$ insert into check_results (org_id, brand_id, check_run_id, rule_key, severity, message)
                    select tests.org_main(), tests.brand_fpd(), id, 'x', 'info', 'x' from check_runs limit 1 $$,
  '42501', null, 'check_results: no direct insert');
select throws_ok($$ delete from check_results $$, '42501', null, 'check_results: no delete');
select tests.act_as_role('service_role');
select throws_ok($$ update check_results set override_reason = 'x' $$, '42501', null, 'check_results: service_role cannot write directly either');

-- client role and outsiders see none of it
select tests.act_as(tests.u_client());
select is((select count(*) from client_accounts) + (select count(*) from job_items) + (select count(*) from audits)
        + (select count(*) from audit_findings) + (select count(*) from deliverables) + (select count(*) from delivery_checklists)
        + (select count(*) from check_results), 0::bigint, 'rls: the client role sees no Phase 2 internals');
select tests.act_as(tests.u_outsider());
select is((select count(*) from client_accounts) + (select count(*) from job_items) + (select count(*) from audits)
        + (select count(*) from audit_findings) + (select count(*) from deliverables) + (select count(*) from delivery_checklists)
        + (select count(*) from check_results), 0::bigint, 'rls: an outsider sees no Phase 2 rows');
select tests.act_as(tests.u_viewer());
select ok((select count(*) from job_items) >= 3 and (select count(*) from audit_findings) = 1 and (select count(*) from check_results) >= 1,
  'rls: a viewer can read them');
select tests.reset_role();

select * from finish();
rollback;
