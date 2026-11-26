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
