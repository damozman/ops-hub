-- Local development seed. ALL DATA IS INVENTED (kickoff §H).
-- Emails use example.test so nothing can reach a real inbox.
-- To sign in locally with your own address, run `npm run seed:emails` after
-- `supabase db reset`; it renames owner@/partner@example.test to
-- SEED_OWNER_EMAIL / SEED_PARTNER_EMAIL from .env.local (never committed).

-- Fixed ids so tests and e2e can refer to them.
-- orgs
--   10000000-0000-4000-8000-000000000001  Mosley Ventures (dev)
--   10000000-0000-4000-8000-000000000002  Other Agency (test)
-- brands
--   20000000-0000-4000-8000-000000000001  fpd  First Pass Data
--   20000000-0000-4000-8000-000000000002  369  369 Agentic Systems
--   20000000-0000-4000-8000-000000000003  oa   Other Agency brand
-- users
--   30000000-0000-4000-8000-0000000000{01..07}

-- ---------------------------------------------------------------------------
-- Auth users (local only). No passwords: sign-in is by magic link.
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('display_name', u.display_name), now(), now(),
  '', '', '', '', '', '', '', ''
from (values
  ('30000000-0000-4000-8000-000000000001'::uuid, 'owner@example.test', 'Chris (dev)'),
  ('30000000-0000-4000-8000-000000000002'::uuid, 'partner@example.test', 'Partner (dev)'),
  ('30000000-0000-4000-8000-000000000003'::uuid, 'reviewer@example.test', 'Reviewer (test)'),
  ('30000000-0000-4000-8000-000000000004'::uuid, 'viewer@example.test', 'Viewer (test)'),
  ('30000000-0000-4000-8000-000000000005'::uuid, 'client@example.test', 'Client (test)'),
  ('30000000-0000-4000-8000-000000000006'::uuid, 'brandlimited@example.test', 'Brand-limited (test)'),
  ('30000000-0000-4000-8000-000000000007'::uuid, 'outsider@example.test', 'Outsider (test)')
) as u(id, email, display_name);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.email like '%@example.test';

-- ---------------------------------------------------------------------------
-- Orgs and brands
-- ---------------------------------------------------------------------------
insert into public.orgs (id, name, slug, created_by) values
  ('10000000-0000-4000-8000-000000000001', 'Mosley Ventures (dev)', 'mosley-dev', '30000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002', 'Other Agency (test)', 'other-agency', '30000000-0000-4000-8000-000000000007');

insert into public.brands (id, org_id, key, name, from_email, legal_footer, created_by) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'fpd', 'First Pass Data',
   'hello@fpd.example.test', 'First Pass Data (fictional dev footer), Fort Worth TX', '30000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '369', '369 Agentic Systems',
   'hello@369.example.test', '369 Agentic Systems (fictional dev footer), Fort Worth TX', '30000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'oa', 'Other Agency Brand',
   'hello@other.example.test', null, '30000000-0000-4000-8000-000000000007');

-- ---------------------------------------------------------------------------
-- Memberships
-- ---------------------------------------------------------------------------
insert into public.memberships (org_id, user_id, role, brand_ids, status, created_by) values
  ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'owner', null, 'active', '30000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'operator', null, 'active', '30000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', 'reviewer', null, 'active', '30000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000004', 'viewer', null, 'active', '30000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000005', 'client', null, 'active', '30000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000006', 'operator',
   array['20000000-0000-4000-8000-000000000002'::uuid], 'active', '30000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000007', 'owner', null, 'active', '30000000-0000-4000-8000-000000000007');

-- ---------------------------------------------------------------------------
-- Phase 1: CRM (all fictional). Phones use the 555-01xx fiction range.
-- Default pipelines were created by the brands trigger.
-- ---------------------------------------------------------------------------
insert into public.companies (id, org_id, name, website, industry, street_address, city, state, sells_online, brand_ids, lifecycle, source, created_by) values
  ('60000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Lone Star Lift & Rack Supply (fictional)',
   'https://example.test/lonestar', 'Industrial supply', '100 Example Way', 'Fort Worth', 'TX', true,
   array['20000000-0000-4000-8000-000000000001'::uuid], 'prospect', 'referral', '30000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Trinity Paws Grooming (fictional)',
   'https://example.test/trinitypaws', 'Pet grooming', '200 Example Ave', 'Fort Worth', 'TX', false,
   array['20000000-0000-4000-8000-000000000002'::uuid], 'client', 'form', '30000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'Cowtown Diesel Parts (fictional)',
   'https://example.test/cowtown', 'Auto parts', null, 'Fort Worth', 'TX', true,
   null, 'lead', 'cold outreach', '30000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'Bluebonnet Candle Co. (fictional)',
   'https://example.test/bluebonnet', 'Home goods', null, 'Fort Worth', 'TX', true,
   array['20000000-0000-4000-8000-000000000001'::uuid], 'client', 'upwork', '30000000-0000-4000-8000-000000000001');

insert into public.contacts (id, org_id, company_id, first_name, last_name, email, phone_e164, title, owner_user_id, created_by) values
  ('61000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001',
   'Dana', 'Example', 'dana@lonestar.example.test', '+18175550101', 'Owner', '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001'),
  ('61000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000002',
   'Riley', 'Sample', 'riley@trinitypaws.example.test', '+18175550102', 'Manager', '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001'),
  ('61000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000003',
   'Morgan', 'Test', 'morgan@cowtown.example.test', '+18175550103', 'Parts lead', '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001'),
  ('61000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000004',
   'Casey', 'Placeholder', 'casey@bluebonnet.example.test', '+18175550104', 'Founder', '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001');

insert into public.deals (id, org_id, brand_id, company_id, contact_id, pipeline_id, stage_id, title, value_cents, offer, owner_user_id, created_by)
select v.id::uuid, '10000000-0000-4000-8000-000000000001', v.brand::uuid, v.company::uuid, v.contact::uuid, p.id,
       (select s.id from public.pipeline_stages s where s.pipeline_id = p.id and s.name = v.stage), v.title, v.value, v.offer,
       '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001'
from (values
  ('62000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', 'Discovery booked', 'Lone Star catalog cleanup', 450000, 'A'),
  ('62000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000002', '61000000-0000-4000-8000-000000000002', 'Won', 'Trinity Paws local visibility', 120000, 'B'),
  ('62000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000003', '61000000-0000-4000-8000-000000000003', 'New lead', 'Cowtown Diesel listing audit', 90000, 'A'),
  ('62000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000004', '61000000-0000-4000-8000-000000000004', 'Won', 'Bluebonnet Shopify + Amazon refresh', 300000, 'A')
) as v(id, brand, company, contact, stage, title, value, offer)
join public.pipelines p on p.brand_id = v.brand::uuid;

insert into public.forms (id, org_id, brand_id, name, consent_text, consent_text_version, created_by) values
  ('63000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   'FPD listing audit request', 'I agree to receive emails and texts from First Pass Data about my request. Reply STOP to opt out.', 'fpd-2026-11-v1',
   '30000000-0000-4000-8000-000000000001'),
  ('63000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002',
   '369 free local visibility check', 'I agree to receive emails and texts from 369 Agentic Systems about my request. Reply STOP to opt out.', '369-2026-11-v1',
   '30000000-0000-4000-8000-000000000001');

-- Invented headers for tests (NOT real AAFES headers). Chris adds the real ones in Settings > Import guard.
insert into public.import_guard_signatures (org_id, label, header_signature, threshold, created_by) values
  ('10000000-0000-4000-8000-000000000001', 'TEST AAFES-like template',
   array['VENDOR_ITEM_NO', 'EXCH_DEPT', 'MFR_PART', 'UPC_CODE', 'RETAIL_PRICE'], 0.8, '30000000-0000-4000-8000-000000000001');
