// Renames the invented seed logins to your real addresses for local sign-in.
// Reads SEED_OWNER_EMAIL / SEED_PARTNER_EMAIL from .env.local. Local stack only.
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url))
  throw new Error("seed:emails only runs against a local Supabase stack");

const admin = createClient(url, key, { auth: { persistSession: false } });
const pairs = [
  ["30000000-0000-4000-8000-000000000001", process.env.SEED_OWNER_EMAIL],
  ["30000000-0000-4000-8000-000000000002", process.env.SEED_PARTNER_EMAIL],
];
for (const [id, email] of pairs) {
  if (!email) continue;
  const { error } = await admin.auth.admin.updateUserById(id, { email, email_confirm: true });
  console.log(error ? `Could not set ${id}: ${error.message}` : `Seed user ${id.slice(-2)} now signs in as ${email}`);
}
