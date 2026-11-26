import { expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { generate } from "otplib";

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

type MailpitSummary = { ID: string; To: { Address: string }[]; Created: string };

export async function latestMessageFor(email: string, after: number): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const body = (await res.json()) as { messages: MailpitSummary[] };
    const msg = body.messages.find((m) => new Date(m.Created).getTime() >= after - 2000);
    if (msg) {
      const full = (await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json()) as {
        Text: string;
        HTML: string;
      };
      const match = (full.HTML + full.Text).match(/https?:\/\/[^\s"'<>]+\/auth\/(?:v1\/verify|confirm)[^\s"'<>]+/);
      if (match) return match[0].replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No magic link email for ${email}`);
}

/** Requests a magic link, opens it from the local mail catcher, and returns at /mfa or the app. */
export async function signInWithMagicLink(page: Page, email: string) {
  const sentAt = Date.now();
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("sign-in link is on its way")).toBeVisible();
  const link = await latestMessageFor(email, sentAt);
  await page.goto(link);
}

/** Enrolls a TOTP factor on the MFA page using the displayed secret. */
export async function enrollTotp(page: Page): Promise<string> {
  await expect(page.getByRole("heading", { name: "Turn on two-step sign-in" })).toBeVisible();
  await page.getByRole("button", { name: "Set up authenticator app" }).click();
  const secret = (await page.getByTestId("totp-secret").textContent())!.trim();
  await page.getByLabel("6-digit code").fill(await generate({ secret }));
  await page.getByRole("button", { name: "Verify and continue" }).click();
  return secret;
}

/** Number of mail-catcher messages to an address since a time. */
export async function mailCountFor(email: string, after: number): Promise<number> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
  const body = (await res.json()) as { messages: MailpitSummary[] };
  return body.messages.filter((m) => new Date(m.Created).getTime() >= after - 2000).length;
}

/** Service-role client for test setup. Refuses anything but a local Supabase stack. */
export function localAdminClient() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url) || !key)
    throw new Error("e2e setup only runs against a local Supabase stack");
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Signs in with a clean MFA state: removes the user's factors first, then enrolls if the role requires it. */
export async function signInFresh(page: Page, email: string) {
  const admin = localAdminClient();
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  const user = data.users.find((u) => u.email === email);
  if (!user) throw new Error(`No seed user ${email}`);
  const { data: factors } = await admin.auth.admin.mfa.listFactors({ userId: user.id });
  for (const f of factors?.factors ?? []) await admin.auth.admin.mfa.deleteFactor({ userId: user.id, id: f.id });
  await signInWithMagicLink(page, email);
  await page.waitForURL(/\/(mfa|[a-z0-9-]+\/dashboard)$/);
  if (page.url().endsWith("/mfa")) {
    await enrollTotp(page);
    await page.waitForURL(/\/dashboard$/);
  }
}

/** Runs a read-only query against the LOCAL database with psql and returns the first column of the first row. */
export function sql(query: string): string {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const url = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  if (!/@(127\.0\.0\.1|localhost):\d+\//.test(url)) throw new Error("sql() only runs against a local database");
  return execFileSync("psql", [url, "-At", "-v", "ON_ERROR_STOP=1", "-c", query], { encoding: "utf8" }).trim();
}
