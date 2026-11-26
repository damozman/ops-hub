import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Makes e2e repeatable: removes MFA factors from the invented @example.test
// seed users so each run enrolls from scratch. Local stack only.
export default async function globalSetup() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for e2e");
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url))
    throw new Error("e2e global setup only runs against a local Supabase stack");

  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  for (const user of data.users.filter((u) => u.email?.endsWith("@example.test"))) {
    const { data: factors } = await admin.auth.admin.mfa.listFactors({ userId: user.id });
    for (const f of factors?.factors ?? []) {
      await admin.auth.admin.mfa.deleteFactor({ userId: user.id, id: f.id });
    }
  }
  await fetch(`${process.env.MAILPIT_URL ?? "http://127.0.0.1:54324"}/api/v1/messages`, { method: "DELETE" });
}
