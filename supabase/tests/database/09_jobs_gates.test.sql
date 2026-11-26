begin;
\ir _helpers.psql
select plan(123);

create function tests.job_a() returns uuid language sql immutable as $$ select '81000000-0000-4000-8000-000000000001'::uuid $$;
create function tests.job_b() returns uuid language sql immutable as $$ select '81000000-0000-4000-8000-000000000002'::uuid $$;
create function tests.item_a1() returns uuid language sql immutable as $$ select '82000000-0000-4000-8000-000000000001'::uuid $$;
grant execute on function tests.job_a(), tests.job_b(), tests.item_a1() to authenticated, service_role;

-- Helper: write a draft version as the current user and return its id.
create function tests.new_version(p_draft uuid, p_content jsonb) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.draft_versions (org_id, draft_id, content) values (tests.org_main(), p_draft, p_content) returning id into v;
  return v;
end $$;
grant execute on function tests.new_version(uuid, jsonb) to authenticated;

-- ===========================================================================
-- canonical_hash
-- ===========================================================================
select is(public.canonical_json('{"b": 1, "a": [1.50, "x\n", true, null, {"z": 2.0, "y": {}}]}'),
  '{"a":[1.5,"x\n",true,null,{"y":{},"z":2}],"b":1}', 'canonical_json: sorted keys, no whitespace, trimmed numbers');
select is(public.canonical_hash('{"a": 1}'), encode(sha256('{"a":1}'::bytea), 'hex'), 'canonical_hash: sha256 hex of canonical JSON');

-- ===========================================================================
-- Direct stage updates fail for every role
-- ===========================================================================
select tests.act_as(tests.u_owner());
select throws_ok($$ update jobs set stage = 'audit' where id = tests.job_a() $$, '42501', null, 'stage: owner cannot update jobs.stage directly');
select tests.act_as(tests.u_partner());
select throws_ok($$ update jobs set stage = 'audit' where id = tests.job_a() $$, '42501', null, 'stage: operator cannot update jobs.stage directly');
select tests.act_as(tests.u_reviewer());
select throws_ok($$ update jobs set stage = 'audit' where id = tests.job_a() $$, '42501', null, 'stage: reviewer cannot update jobs.stage directly');
select tests.act_as(tests.u_viewer());
select throws_ok($$ update jobs set stage = 'audit' where id = tests.job_a() $$, '42501', null, 'stage: viewer cannot update jobs.stage directly');
select tests.act_as(tests.u_client());
select throws_ok($$ update jobs set stage = 'audit' where id = tests.job_a() $$, '42501', null, 'stage: client cannot update jobs.stage directly');
select tests.act_as_role('service_role');
select throws_ok($$ update jobs set stage = 'audit' where id = tests.job_a() $$, '42501', null, 'stage: service_role cannot update jobs.stage directly');
select tests.reset_role();
select is((select stage from jobs where id = tests.job_a()), 'intake', 'stage: still intake');

-- A user who inserts a job can't pick its stage.
select tests.act_as(tests.u_partner());
select throws_ok($$ insert into jobs (org_id, client_account_id, offer, title, stage) values (tests.org_main(), '80000000-0000-4000-8000-000000000001', 'A', 'x', 'approved') $$,
  '42501', null, 'stage: cannot be set on insert either');
insert into jobs (org_id, client_account_id, offer, title) values (tests.org_main(), '80000000-0000-4000-8000-000000000001', 'A', 'Spare job');
select tests.reset_role();
select is((select stage || ':' || brand_id::text from jobs where title = 'Spare job'), 'intake:' || tests.brand_fpd()::text,
  'jobs: new job starts in intake with the client account''s brand');
select is((select jsonb_array_length(items) from intake_checklists where job_id = (select id from jobs where title = 'Spare job')), 6,
  'jobs: a new job gets the 6 default intake items');

-- ===========================================================================
-- G1 intake -> audit
-- ===========================================================================
select tests.act_as(tests.u_partner());
select throws_like($$ select public.transition_job(tests.job_a(), 'audit') $$, 'Gate G1 failed%', 'G1: refuses while intake items are open');
select throws_like($$ select public.transition_job(tests.job_a(), 'drafts') $$, '%can''t move from intake to drafts%', 'moves: cannot skip stages');
select tests.act_as(tests.u_viewer());
select throws_ok($$ select public.set_checklist_item(tests.job_a(), 'intake', 'scope_set', true) $$, '42501', null, 'G1: a viewer cannot tick intake items');
select throws_ok($$ update intake_checklists set items = '[]' where job_id = tests.job_a() $$, '42501', null, 'G1: checklists are not directly writable');
select tests.act_as(tests.u_partner());
select lives_ok($$ select public.set_checklist_item(tests.job_a(), 'intake', k, true, 'evidence ' || k)
                   from unnest(array['scope_set', 'brand_set', 'sensitivity_set', 'access_confirmed', 'owner_contact_set']) k $$,
  'G1: operator ticks five items');
select throws_like($$ select public.transition_job(tests.job_a(), 'audit') $$, '%Not done: Signed proposal%', 'G1: the error names the open item');
select public.set_checklist_item(tests.job_a(), 'intake', 'contract_recorded', true, 'UPWORK-TEST-0001');
select tests.reset_role();
select is((select (e ->> 'done_by')::uuid from intake_checklists, jsonb_array_elements(items) e
           where job_id = tests.job_a() and e ->> 'key' = 'contract_recorded'), tests.u_partner(), 'G1: done_by is the user who ticked it');
select tests.act_as(tests.u_partner());
select lives_ok($$ select public.transition_job(tests.job_a(), 'audit') $$, 'G1: passes once every item is done');
select tests.reset_role();
select is((select count(*) from job_stage_events where job_id = tests.job_a() and from_stage = 'intake' and to_stage = 'audit'
             and gate_results -> 0 ->> 'gate' = 'G1'), 1::bigint, 'G1: stage event records the gate result');
select is((select count(*) from events where type = 'job.transitioned' and subject_id = tests.job_a()), 1::bigint, 'G1: emits job.transitioned');
select ok((select count(*) from audit_log where subject_type = 'jobs' and subject_id = tests.job_a() and action = 'update') >= 1, 'G1: the stage change is in audit_log');
select throws_ok($$ update job_stage_events set reason = 'x' $$, '42501', null, 'job_stage_events: append-only');

-- ===========================================================================
-- G2 audit -> drafts
-- ===========================================================================
select tests.act_as(tests.u_partner());
select throws_like($$ select public.transition_job(tests.job_a(), 'drafts') $$, 'Gate G2 failed%No audit%', 'G2: refuses with no audit');
insert into audits (org_id, job_id, engine, score) values (tests.org_main(), tests.job_a(), 'manual', 62);
select throws_like($$ select public.transition_job(tests.job_a(), 'drafts') $$, 'Gate G2 failed%running%', 'G2: refuses while the audit is running');
insert into audit_findings (org_id, audit_id, job_item_id, severity, field, message)
select tests.org_main(), id, tests.item_a1(), 'major', 'title', 'Title misses the scent name' from audits where job_id = tests.job_a();
update audits set status = 'finished' where job_id = tests.job_a();
select throws_ok($$ insert into audit_findings (org_id, audit_id, severity, message) select tests.org_main(), id, 'minor', 'late' from audits where job_id = tests.job_a() $$,
  '42501', null, 'G2: findings are frozen once the audit is finished');
select lives_ok($$ select public.transition_job(tests.job_a(), 'drafts') $$, 'G2: passes with a finished audit and rules version');
select tests.reset_role();
select is((select rules_version from audits where job_id = tests.job_a()), 'manual-v1', 'G2: manual audits record rules_version manual-v1');

-- ===========================================================================
-- Drafts, versions, checks (G3)
-- ===========================================================================
select tests.act_as(tests.u_partner());
insert into drafts (id, org_id, job_id, job_item_id, kind, title) values
  ('83000000-0000-4000-8000-000000000001', tests.org_main(), tests.job_a(), tests.item_a1(), 'listing', 'Wildflower listing'),
  ('83000000-0000-4000-8000-000000000002', tests.org_main(), tests.job_a(), null, 'other', 'Client note');
select throws_like($$ select public.transition_job(tests.job_a(), 'review') $$, 'Gate G3 failed%no content yet%', 'G3: refuses drafts without content');
create temp table v on commit drop as
  select tests.new_version('83000000-0000-4000-8000-000000000001',
           '{"title": "Bluebonnet Candle Texas Wildflower Soy Candle, 8 oz", "bullets": ["About 45 hours of burn time"], "description": "Hand-poured soy wax."}') as v1,
         tests.new_version('83000000-0000-4000-8000-000000000002', '{"body": "Summary for the client."}') as v2;
grant select on v to authenticated, service_role;
select tests.reset_role();
select is((select version || ':' || author_kind || ':' || author_id::text from draft_versions where id = (select v1 from v)),
  '1:user:' || tests.u_partner()::text, 'versions: numbered from 1 and stamped with the signed-in author');
select is((select content_hash from draft_versions where id = (select v1 from v)),
  public.canonical_hash((select content from draft_versions where id = (select v1 from v))), 'versions: content_hash = canonical_hash(content)');
select is((select current_version_id from drafts where id = '83000000-0000-4000-8000-000000000001'), (select v1 from v), 'versions: becomes the current version');

select tests.act_as(tests.u_partner());
select throws_ok($$ insert into draft_versions (org_id, draft_id, content, content_hash) values (tests.org_main(), '83000000-0000-4000-8000-000000000002', '{"body": "x"}', 'deadbeef') $$,
  '23514', null, 'versions: a wrong content_hash is rejected');
select throws_ok($$ update draft_versions set content = '{}' where id = (select v1 from v) $$, '42501', null, 'versions: immutable (no UPDATE)');
select throws_ok($$ delete from draft_versions where id = (select v1 from v) $$, '42501', null, 'versions: immutable (no DELETE)');
select throws_ok($$ update drafts set status = 'approved' where id = '83000000-0000-4000-8000-000000000001' $$, '42501', null, 'drafts: status is not writable by users');
select throws_ok($$ insert into check_runs (org_id, draft_version_id, rules_version, passed) values (tests.org_main(), (select v1 from v), 'x', true) $$,
  '42501', null, 'checks: users cannot write check runs');
select throws_ok($$ select public.record_check_run((select v1 from v), 'r-x', '[]') $$, '42501', null, 'checks: users cannot call record_check_run');
select throws_like($$ select public.transition_job(tests.job_a(), 'review') $$, 'Gate G3 failed%checks have not run%', 'G3: refuses before checks run');

-- The checks engine (service role) records a blocker on draft 1 and a clean run on draft 2.
select tests.act_as_role('service_role');
create temp table runs on commit drop as
  select public.record_check_run((select v1 from v), 'r-test',
           '[{"rule_key": "spec.fidelity", "severity": "blocker", "message": "Unverified spec", "span": {"field": "title", "start": 0, "end": 4}},
             {"rule_key": "claims.all_caps", "severity": "warning", "message": "ALL CAPS"}]') as r1,
         public.record_check_run((select v2 from v), 'r-test', '[]') as r2;
select tests.reset_role();
grant select on runs to authenticated;
select is((select status from drafts where id = '83000000-0000-4000-8000-000000000001'), 'checks_failed', 'checks: a blocker sets checks_failed');
select is((select status from drafts where id = '83000000-0000-4000-8000-000000000002'), 'ready_for_review', 'checks: a clean run sets ready_for_review');
select is((select blocker_count || '/' || warning_count || '/' || passed from check_runs where id = (select r1 from runs)), '1/1/false', 'checks: counts stored');

select tests.act_as(tests.u_partner());
select throws_like($$ select public.transition_job(tests.job_a(), 'review') $$, 'Gate G3 failed%Wildflower listing%blockers%', 'G3: refuses a draft with blockers');
select throws_ok($$ select public.override_check_result((select id from check_results where check_run_id = (select r1 from runs) and severity = 'blocker'), 'Client confirmed by email') $$,
  '42501', null, 'G3: an operator cannot override a blocker');
select tests.act_as(tests.u_owner());
select throws_ok($$ select public.override_check_result((select id from check_results where check_run_id = (select r1 from runs) and severity = 'blocker'), '') $$,
  '23514', null, 'G3: an override needs a reason');
select lives_ok($$ select public.override_check_result((select id from check_results where check_run_id = (select r1 from runs) and severity = 'blocker'), 'Client confirmed 8 oz by email') $$,
  'G3: the owner overrides with a reason');
select tests.reset_role();
select is((select status from drafts where id = '83000000-0000-4000-8000-000000000001'), 'ready_for_review', 'G3: override clears checks_failed');
select ok(exists (select 1 from audit_log where subject_type = 'check_results' and action = 'update' and actor_id = tests.u_owner()
                  and after ->> 'override_reason' = 'Client confirmed 8 oz by email'), 'G3: the override is in audit_log');
select tests.act_as(tests.u_partner());
select lives_ok($$ select public.transition_job(tests.job_a(), 'review') $$, 'G3: passes when every in-scope draft passes or is overridden');

-- ===========================================================================
-- G4 review -> approved, two-person rule
-- ===========================================================================
select throws_like($$ select public.transition_job(tests.job_a(), 'approved') $$, 'Gate G4 failed%waiting for approval%', 'G4: refuses without approvals');
select throws_like($$ select public.approve_subject('draft_version', (select v1 from v), 'approved') $$,
  'Two-person rule%', 'two-person: the author (operator with approve) cannot approve their own draft');
select throws_ok($$ insert into approvals (org_id, brand_id, subject_type, subject_id, content_hash, approver_id, approver_role, decision)
                    values (tests.org_main(), tests.brand_fpd(), 'draft_version', (select v1 from v), 'x', tests.u_partner(), 'operator', 'approved') $$,
  '42501', null, 'approvals: no direct insert');
select tests.act_as(tests.u_viewer());
select throws_ok($$ select public.approve_subject('draft_version', (select v1 from v), 'approved') $$, '42501', null, 'approvals: a viewer cannot approve');
select tests.act_as(tests.u_owner());
select throws_like($$ select public.approve_subject('draft_version', (select v1 from v), 'approved') $$, '%1 warning(s). Confirm%',
  'approvals: a version with warnings needs the acknowledgement');
select lives_ok($$ select public.approve_subject('draft_version', (select v1 from v), 'approved', null, true) $$, 'two-person: the other human can approve');
select throws_ok($$ select public.approve_subject('draft_version', (select v2 from v), 'changes_requested') $$, '23514', null, 'approvals: changes requested needs a comment');
select lives_ok($$ select public.approve_subject('draft_version', (select v2 from v), 'changes_requested', 'Add the delivery date') $$, 'approvals: owner requests changes');
select throws_like($$ select public.transition_job(tests.job_a(), 'approved') $$, 'Gate G4 failed%Client note%changes requested%', 'G4: refuses when a draft has changes requested');
select tests.act_as(tests.u_reviewer());
select lives_ok($$ select public.approve_subject('draft_version', (select v2 from v), 'approved') $$, 'approvals: a reviewer approves the other draft');
select tests.reset_role();
select is((select count(*) from notifications where kind = 'changes_requested' and user_id = tests.u_partner()), 1::bigint, 'approvals: the author is notified of requested changes');
select is((select status from drafts where id = '83000000-0000-4000-8000-000000000002'), 'approved', 'approvals: the latest decision sets the draft status');
select tests.act_as(tests.u_owner());
select throws_ok($$ update approvals set stale = true $$, '42501', null, 'approvals: users cannot set stale');
select throws_ok($$ update approvals set decision = 'rejected' $$, '42501', null, 'approvals: users cannot change a decision');
select tests.reset_role();
select throws_ok($$ update approvals set decision = 'rejected' $$, '42501', null, 'approvals: append-only even for the table owner');

-- With the two-person rule off, the author may approve (on another draft; checked at the gate too).
update settings set value = 'false' where org_id = tests.org_main() and key = 'two_person_rule';
select tests.act_as(tests.u_partner());
select lives_ok($$ select public.transition_job(tests.job_a(), 'approved') $$, 'G4: passes with a current approval per draft');
select tests.reset_role();
update settings set value = 'true' where org_id = tests.org_main() and key = 'two_person_rule';
select is((select stage from jobs where id = tests.job_a()), 'approved', 'G4: job is approved');

-- ===========================================================================
-- Editing an approved job: approvals go stale, job returns to drafts
-- ===========================================================================
select tests.act_as(tests.u_owner());
create temp table v3 on commit drop as
  select tests.new_version('83000000-0000-4000-8000-000000000001',
           '{"title": "Bluebonnet Candle Texas Wildflower Soy Candle, 8 oz", "bullets": ["About 45 hours of clean burn time"], "description": "Hand-poured soy wax."}') as v3;
grant select on v3 to authenticated, service_role;
select tests.reset_role();
select is((select stage from jobs where id = tests.job_a()), 'drafts', 'invalidate: an approved job falls back to drafts');
select is((select reason from job_stage_events where job_id = tests.job_a() order by at desc, created_at desc limit 1), 'content_changed_after_approval',
  'invalidate: stage event reason content_changed_after_approval');
select ok((select bool_and(stale) from approvals where subject_type = 'draft_version' and subject_id = (select v1 from v)), 'invalidate: old approvals of that draft are stale');
select ok((select not bool_or(stale) from approvals where subject_type = 'draft_version' and subject_id = (select v2 from v)), 'invalidate: other drafts keep their approvals');
select is((select status from drafts where id = '83000000-0000-4000-8000-000000000001'), 'draft', 'invalidate: the edited draft waits for checks');

-- Back through G3 and G4 (the owner wrote v3, so the reviewer approves it).
select tests.act_as_role('service_role');
select public.record_check_run((select v3 from v3), 'r-test', '[]');
select tests.act_as(tests.u_partner());
select public.transition_job(tests.job_a(), 'review');
select tests.act_as(tests.u_owner());
select throws_like($$ select public.approve_subject('draft_version', (select v3 from v3), 'approved') $$, 'Two-person rule%', 'two-person: the last editor cannot approve');
select throws_like($$ select public.approve_subject('draft_version', (select v1 from v), 'approved') $$, '%not the current version%', 'approvals: only the current version can be approved');
select tests.act_as(tests.u_reviewer());
select public.approve_subject('draft_version', (select v3 from v3), 'approved');
select tests.act_as(tests.u_partner());
select lives_ok($$ select public.transition_job(tests.job_a(), 'approved') $$, 'G4: passes again after re-approval');

-- ===========================================================================
-- Outbox: approval binds to the content hash; release is the only way to "sent"
-- ===========================================================================
insert into outbox_messages (id, org_id, brand_id, job_id, channel, recipient, subject, body)
values ('84000000-0000-4000-8000-000000000001', tests.org_main(), tests.brand_fpd(), tests.job_a(), 'email', 'casey@bluebonnet.example.test',
        'Your listing drafts', 'Hi Casey, your drafts are ready.');
select tests.reset_role();
select is((select status || ':' || (content_hash = public.outbox_content_hash(channel, recipient, subject, body, payload))::text
           from outbox_messages where id = '84000000-0000-4000-8000-000000000001'), 'pending_approval:true', 'outbox: new item waits for approval with its hash');
select tests.act_as(tests.u_partner());
select throws_ok($$ update outbox_messages set status = 'sent' where id = '84000000-0000-4000-8000-000000000001' $$, '42501', null, 'outbox: status is not writable');
select throws_like($$ select public.approve_subject('outbox_message', '84000000-0000-4000-8000-000000000001', 'approved') $$, 'Two-person rule%', 'outbox: the author cannot approve');
select tests.act_as(tests.u_owner());
select public.approve_subject('outbox_message', '84000000-0000-4000-8000-000000000001', 'approved');
select tests.act_as(tests.u_partner());
select throws_ok($$ select public.release_outbox('84000000-0000-4000-8000-000000000001') $$, '42501', null, 'release: refused without outbox.release (operator default)');

-- Edit after approval: back to pending, approval stale.
update outbox_messages set body = 'Hi Casey, your drafts are ready. One more line.' where id = '84000000-0000-4000-8000-000000000001';
select tests.reset_role();
select is((select status from outbox_messages where id = '84000000-0000-4000-8000-000000000001'), 'pending_approval', 'outbox: an edit after approval returns it to pending');
select ok((select bool_and(stale) from approvals where subject_type = 'outbox_message'), 'outbox: the edit marks the approval stale');
select tests.act_as(tests.u_owner());
select throws_like($$ select public.release_outbox('84000000-0000-4000-8000-000000000001') $$, 'Only an approved item%', 'release: refuses an unapproved item');
select public.approve_subject('outbox_message', '84000000-0000-4000-8000-000000000001', 'approved');

-- Tampering (only possible below the API) is still caught.
select tests.reset_role();
update outbox_messages set content_hash = 'tampered' where id = '84000000-0000-4000-8000-000000000001';
select tests.act_as(tests.u_owner());
select throws_like($$ select public.release_outbox('84000000-0000-4000-8000-000000000001') $$, '%content hash does not match the approved hash%', 'release: refuses when hash differs from the approved hash');
select tests.reset_role();
update outbox_messages set content_hash = public.outbox_content_hash(channel, recipient, subject, body, payload) where id = '84000000-0000-4000-8000-000000000001';
update approvals set stale = true where id = (select approval_id from outbox_messages where id = '84000000-0000-4000-8000-000000000001');
select tests.act_as(tests.u_owner());
select throws_like($$ select public.release_outbox('84000000-0000-4000-8000-000000000001') $$, '%approval is stale%', 'release: refuses a stale approval');
select tests.reset_role();
select throws_ok($$ update approvals set stale = false where stale $$, '42501', null, 'approvals: stale cannot be cleared');
-- A fresh approval: edit (to re-open) and approve again, then release.
select tests.act_as(tests.u_partner());
update outbox_messages set subject = 'Your listing drafts are ready' where id = '84000000-0000-4000-8000-000000000001';
select tests.act_as(tests.u_owner());
select public.approve_subject('outbox_message', '84000000-0000-4000-8000-000000000001', 'approved');
select lives_ok($$ select public.release_outbox('84000000-0000-4000-8000-000000000001') $$, 'release: the owner releases an approved item (manual send)');
select tests.reset_role();
select is((select status || ':' || sent_by::text || ':' || provider_id from outbox_messages where id = '84000000-0000-4000-8000-000000000001'),
  'sent:' || tests.u_owner()::text || ':manual', 'release: marked sent by the releasing user, provider manual');
select is((select count(*) from events where type = 'outbox.released'), 1::bigint, 'release: emits outbox.released');
select tests.act_as(tests.u_partner());
select throws_ok($$ update outbox_messages set body = 'changed' where id = '84000000-0000-4000-8000-000000000001' $$, '42501', null, 'outbox: a sent item cannot be edited');

-- ===========================================================================
-- G5 approved -> delivered, G6 delivered -> upkeep
-- ===========================================================================
insert into outbox_messages (org_id, brand_id, job_id, channel, body) values (tests.org_main(), tests.brand_fpd(), tests.job_a(), 'manual', 'Upload flat file');
select throws_like($$ select public.transition_job(tests.job_a(), 'delivered') $$, 'Gate G5 failed%Not done: Backup%outbox item%', 'G5: refuses with open checklist and outbox');
select public.set_checklist_item(tests.job_a(), 'delivery', k, true) from unnest(array['backup_taken', 'deliverables_uploaded', 'client_notified']) k;
select throws_like($$ select public.transition_job(tests.job_a(), 'delivered') $$, 'Gate G5 failed%1 outbox item%', 'G5: refuses while an outbox item is unsettled');
select throws_ok($$ select public.cancel_outbox((select id from outbox_messages where body = 'Upload flat file'), '') $$, '23514', null, 'outbox: cancelling needs a reason');
select public.cancel_outbox((select id from outbox_messages where body = 'Upload flat file'), 'Done by hand in Seller Central');
select lives_ok($$ select public.transition_job(tests.job_a(), 'delivered') $$, 'G5: passes when the checklist is done and outbox items are sent or cancelled');
select tests.reset_role();
select is((select count(*) from drafts where job_id = tests.job_a() and status = 'delivered'), 2::bigint, 'G5: approved drafts become delivered');

select tests.act_as(tests.u_partner());
select throws_like($$ select public.transition_job(tests.job_a(), 'upkeep') $$, 'Gate G6 failed%subscription%', 'G6: refuses without a subscription');
select throws_like($$ select public.transition_job(tests.job_a(), 'upkeep', 'Agreed on a call', true) $$, 'Gate G6 failed: only the owner%', 'G6: only the owner can override');
select throws_ok($$ select tests.new_version('83000000-0000-4000-8000-000000000001', '{"title": "late edit"}') $$, '42501', null, 'versions: drafts on a delivered job are frozen');
select tests.act_as(tests.u_owner());
select lives_ok($$ select public.transition_job(tests.job_a(), 'upkeep', 'Upkeep agreed on a call', true) $$, 'G6: the owner overrides with a reason');
select tests.reset_role();
select is((select gate_results -> 0 -> 'override' ->> 'reason' from job_stage_events where job_id = tests.job_a() and to_stage = 'upkeep'),
  'Upkeep agreed on a call', 'G6: the override is recorded in the stage event');

-- ===========================================================================
-- Cancel, back-moves
-- ===========================================================================
select tests.act_as(tests.u_partner());
select throws_like($$ select public.transition_job(tests.job_b(), 'cancelled', 'Client paused') $$, 'Only an owner or admin%', 'cancel: an operator cannot cancel');
select tests.act_as(tests.u_owner());
select throws_ok($$ select public.transition_job(tests.job_b(), 'cancelled') $$, '23514', null, 'cancel: needs a reason');

-- ===========================================================================
-- RLS: brands, orgs, roles
-- ===========================================================================
select tests.act_as(tests.u_brandlimited());
select is((select count(*) from jobs where id = tests.job_a()), 0::bigint, 'rls: a 369-only user cannot see the FPD job');
select is((select count(*) from jobs where id = tests.job_b()), 1::bigint, 'rls: a 369-only user sees the 369 job');
select is((select count(*) from drafts where job_id = tests.job_a()), 0::bigint, 'rls: ... nor its drafts');
select is((select count(*) from draft_versions where draft_id = '83000000-0000-4000-8000-000000000001'), 0::bigint, 'rls: ... nor its versions');
select is((select count(*) from approvals where job_id = tests.job_a()), 0::bigint, 'rls: ... nor its approvals');
select is((select count(*) from outbox_messages where job_id = tests.job_a()), 0::bigint, 'rls: ... nor its outbox');
select is((select count(*) from job_stage_events where job_id = tests.job_a()), 0::bigint, 'rls: ... nor its stage events');
select throws_ok($$ select public.transition_job(tests.job_a(), 'closed') $$, '42501', null, 'rls: cannot move the FPD job');
select throws_ok($$ select public.job_gates(tests.job_a()) $$, '42501', null, 'rls: cannot read the FPD job''s gates');
select throws_ok($$ insert into drafts (org_id, job_id, kind) values (tests.org_main(), tests.job_a(), 'other') $$, '42501', null, 'rls: cannot add drafts to the FPD job');
select tests.act_as(tests.u_outsider());
select is((select count(*) from jobs), 0::bigint, 'rls: an outsider sees no jobs');
select is((select count(*) from client_accounts), 0::bigint, 'rls: an outsider sees no client accounts');
select tests.act_as(tests.u_client());
select is((select count(*) from jobs), 0::bigint, 'rls: the client role sees no internal jobs');
select is((select count(*) from check_rules where org_id is not null), 0::bigint, 'rls: the client role sees no org rule overrides');
select tests.act_as(tests.u_viewer());
select ok((select count(*) from jobs) >= 2, 'rls: a viewer can read jobs');
select throws_ok($$ insert into jobs (org_id, client_account_id, offer, title) values (tests.org_main(), '80000000-0000-4000-8000-000000000001', 'A', 'v') $$,
  '42501', null, 'rls: a viewer cannot create jobs');
select tests.act_as(tests.u_reviewer());
select throws_ok($$ insert into drafts (org_id, job_id, kind) values (tests.org_main(), tests.job_b(), 'other') $$, '42501', null, 'rls: a reviewer cannot write drafts');
select ok((select count(*) from check_rules where org_id is null) >= 30, 'check_rules: members can read the global rule packs');
select tests.act_as(tests.u_partner());
select throws_ok($$ insert into check_rules (org_id, rule_key, pack, title, severity) values (tests.org_main(), 'claims.fda', 'x', 'x', 'warning') $$,
  '42501', null, 'check_rules: an operator cannot override rules');
update check_rules set severity = 'info' where org_id is null;
select is((select count(*) from check_rules where org_id is null and severity = 'info'), 0::bigint, 'check_rules: global rules are read-only');
select tests.act_as(tests.u_owner());
insert into check_rules (org_id, rule_key, pack, title, severity, params) values (tests.org_main(), 'claims.competitors', '3_banned_claims', 'Competitors', 'blocker', '{"names": ["Fictional Wax Co"]}');
update check_rules set params = '{"names": ["Fictional Wax Co", "Other Fictional Candles"]}' where org_id = tests.org_main() and rule_key = 'claims.competitors';
select tests.reset_role();
select is((select version from check_rules where org_id = tests.org_main() and rule_key = 'claims.competitors'), 2, 'check_rules: an org override bumps its version when changed');

-- svc roles still have nothing on the new tables
select is((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname in ('jobs', 'drafts', 'draft_versions', 'approvals', 'outbox_messages', 'check_rules')
             and (has_table_privilege('svc_drafts', c.oid, 'select,insert,update,delete') or has_table_privilege('svc_worker', c.oid, 'select,insert,update,delete'))),
  0::bigint, 'svc roles: no privileges on Phase 2 tables');

select * from finish();
rollback;
