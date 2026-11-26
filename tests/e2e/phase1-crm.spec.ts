import { expect, test } from "@playwright/test";
import { signInFresh, sql } from "./helpers";

// Phase 1 acceptance tests (kickoff §I). All data is invented.
const MAIN_ORG = "10000000-0000-4000-8000-000000000001";
const FPD_FORM = "63000000-0000-4000-8000-000000000001";
const LONE_STAR = "60000000-0000-4000-8000-000000000001";
const LONE_STAR_DEAL = "62000000-0000-4000-8000-000000000001";
const COWTOWN_DEAL = "62000000-0000-4000-8000-000000000003";
const PARTNER_ID = "30000000-0000-4000-8000-000000000002";
const REVIEWER_ID = "30000000-0000-4000-8000-000000000003";

const ip = () => `198.51.100.${Math.floor(Math.random() * 250) + 1}`; // TEST-NET-2, never routable

test.describe.configure({ mode: "serial" });

test("form submit creates contact, deal, task, notification and events within 5 s", async ({ request }) => {
  const email = `lead-${Date.now()}@example.test`;
  const started = Date.now();
  const res = await request.post(`/api/forms/${FPD_FORM}`, {
    headers: { "x-forwarded-for": ip() },
    data: {
      first_name: "Jordan",
      last_name: "Lead",
      email,
      company: `Lead Co ${Date.now()} (fictional)`,
      consent: true,
    },
  });
  expect(res.status()).toBe(200);
  expect(Date.now() - started).toBeLessThan(5000);

  const contact = sql(`select id from contacts where email = '${email}'`);
  expect(contact).not.toBe("");
  expect(
    sql(`select count(*) from deals d join form_submissions s on s.deal_id = d.id where s.contact_id = '${contact}'`),
  ).toBe("1");
  expect(
    sql(
      `select count(*) from tasks t join form_submissions s on t.subject_id = s.deal_id where s.contact_id = '${contact}'`,
    ),
  ).toBe("1");
  expect(
    Number(
      sql(
        `select count(*) from notifications n join form_submissions s on n.subject_id = s.deal_id where s.contact_id = '${contact}'`,
      ),
    ),
  ).toBeGreaterThan(0);
  expect(
    sql(`select count(*) from events where type = 'form.submitted' and payload ->> 'contact_id' = '${contact}'`),
  ).toBe("1");
  // Consent ticked -> a consents row with the form's consent text version.
  expect(sql(`select consent_text_version from consents where contact_id = '${contact}' limit 1`)).toBe(
    "fpd-2026-11-v1",
  );
});

test("no consent means no consents row; honeypot is rejected; the 11th submit in a minute is rate-limited", async ({
  page,
  request,
}) => {
  // Through the hosted page, without ticking consent.
  const email = `noconsent-${Date.now()}@example.test`;
  await page.goto(`/f/${FPD_FORM}`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("First name", { exact: true }).fill("Casey");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("We got your request")).toBeVisible();
  const contact = sql(`select id from contacts where email = '${email}'`);
  expect(contact).not.toBe("");
  expect(sql(`select count(*) from consents where contact_id = '${contact}'`)).toBe("0");

  const spam = await request.post(`/api/forms/${FPD_FORM}`, {
    headers: { "x-forwarded-for": ip() },
    data: { email: `bot-${Date.now()}@example.test`, website_url: "http://spam.example.test" },
  });
  expect(spam.status()).toBe(400);

  const sameIp = ip();
  const statuses: number[] = [];
  for (let i = 0; i < 11; i++) {
    const r = await request.post(`/api/forms/${FPD_FORM}`, {
      headers: { "x-forwarded-for": sameIp },
      data: { email: `burst-${Date.now()}-${i}@example.test` },
    });
    statuses.push(r.status());
  }
  expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
  expect(statuses[10]).toBe(429);
});

test("deal stage change writes activity, event and audit rows, and the partner's board updates live", async ({
  page,
  browser,
}) => {
  await signInFresh(page, "owner@example.test");
  const partnerContext = await browser.newContext();
  const partner = await partnerContext.newPage();
  await signInFresh(partner, "partner@example.test");

  await page.goto("/mosley-dev/crm/deals");
  await partner.goto("/mosley-dev/crm/deals");
  const card = (p: typeof page) => p.getByTestId("deal-card").filter({ hasText: "Cowtown Diesel listing audit" });
  await expect(card(partner)).toBeVisible();
  // Give the partner's Realtime subscription a moment to join.
  await partner.waitForTimeout(1500);

  await card(page).getByRole("combobox").selectOption({ label: "Contacted" });
  const contactedColumn = (p: typeof page) =>
    p.getByRole("region", { name: /First Pass Data/ }).locator('[data-testid="stage-column"][data-stage="Contacted"]');
  await expect(contactedColumn(page)).toContainText("Cowtown Diesel listing audit");
  // Partner sees it without reloading.
  await expect(contactedColumn(partner)).toContainText("Cowtown Diesel listing audit", { timeout: 10_000 });

  await expect
    .poll(() =>
      Number(sql(`select count(*) from activities where subject_id = '${COWTOWN_DEAL}' and kind = 'stage_change'`)),
    )
    .toBeGreaterThan(0);
  expect(
    Number(sql(`select count(*) from events where subject_id = '${COWTOWN_DEAL}' and type = 'deal.stage_changed'`)),
  ).toBeGreaterThan(0);
  expect(
    Number(
      sql(
        `select count(*) from audit_log where subject_id = '${COWTOWN_DEAL}' and action = 'update' and actor_kind = 'user'`,
      ),
    ),
  ).toBeGreaterThan(0);
  await partnerContext.close();
});

test("cross-sell: winning an Offer A deal for a company with a street address creates a task and no outbound message", async ({
  page,
}) => {
  await signInFresh(page, "owner@example.test");
  await page.goto("/mosley-dev/crm/deals");
  await page
    .getByTestId("deal-card")
    .filter({ hasText: "Lone Star catalog cleanup" })
    .getByRole("combobox")
    .selectOption({ label: "Won" });
  await expect(
    page.getByRole("region", { name: /First Pass Data/ }).locator('[data-testid="stage-column"][data-stage="Won"]'),
  ).toContainText("Lone Star catalog cleanup");
  // The board moves the card optimistically; wait for the saved row.
  await expect.poll(() => sql(`select status from deals where id = '${LONE_STAR_DEAL}'`)).toBe("won");

  await page.goto(`/mosley-dev/crm/companies/${LONE_STAR}`);
  await expect(page.getByTestId("cross-sell")).toContainText("Cross-sell: offer 369 local visibility");
  expect(sql(`select count(*) from tasks where dedupe_key = 'xsell:A->B:${LONE_STAR}'`)).toBe("1");
  // No outbox exists in Phase 1, and nothing was queued anywhere.
  expect(sql(`select coalesce(to_regclass('public.outbox_messages')::text, 'none')`)).toBe("none");
});

test("@mention notifies only the mentioned user; a viewer cannot comment", async ({ page }) => {
  await signInFresh(page, "owner@example.test");
  await page.goto(`/mosley-dev/crm/companies/${LONE_STAR}`);
  const before = (id: string) =>
    Number(sql(`select count(*) from notifications where user_id = '${id}' and kind = 'mention'`));
  const partnerBefore = before(PARTNER_ID);
  const reviewerBefore = before(REVIEWER_ID);
  await page.getByLabel(/Add a comment/).fill("@Partner (dev) can you call them this week?");
  await page.getByRole("button", { name: "Comment" }).click();
  await expect(page.getByText("Notified Partner (dev)")).toBeVisible();
  expect(before(PARTNER_ID)).toBe(partnerBefore + 1);
  expect(before(REVIEWER_ID)).toBe(reviewerBefore);

  await signInFresh(page, "viewer@example.test");
  await page.goto(`/mosley-dev/crm/companies/${LONE_STAR}`);
  await expect(page.getByTestId("comments")).toContainText("can you call them this week?");
  await expect(page.getByText("Your role can read comments but not add them.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Comment" })).toHaveCount(0);
});

test("partner sees the mention in their inbox and can mark it read", async ({ page }) => {
  await signInFresh(page, "partner@example.test");
  await expect(page.getByRole("link", { name: /Inbox \(\d+\)/ })).toBeVisible();
  await page.goto("/mosley-dev/inbox");
  await expect(page.getByTestId("notifications")).toContainText("You were mentioned");
  await page.getByRole("button", { name: "Mark all read" }).click();
  await expect(page.locator('[data-unread="true"]')).toHaveCount(0);
});

test("contact CSV import: a file matching the import-guard template is refused and logged; a normal CSV imports with dedupe", async ({
  page,
}) => {
  await signInFresh(page, "owner@example.test");
  await page.goto("/mosley-dev/crm/contacts/import");

  const guarded = "VENDOR_ITEM_NO,EXCH_DEPT,MFR_PART,UPC_CODE,Notes\nX1,10,P-1,000000000000,invented\n";
  await page
    .getByLabel(/CSV file/)
    .setInputFiles({ name: "catalog.csv", mimeType: "text/csv", buffer: Buffer.from(guarded) });
  await page.getByRole("button", { name: "Upload and preview" }).click();
  await expect(page.getByTestId("import-blocked")).toContainText("TEST AAFES-like template");
  expect(
    Number(sql(`select count(*) from audit_log where action = 'app.import.blocked' and org_id = '${MAIN_ORG}'`)),
  ).toBeGreaterThan(0);
  expect(sql(`select count(*) from files where org_id = '${MAIN_ORG}' and path like '%catalog%'`)).toBe("0");

  const stamp = Date.now();
  const normal = [
    "First Name,Last Name,Email,Phone,Company",
    `Avery,Import,avery-${stamp}@example.test,817-555-0150,Import Co ${stamp} (fictional)`,
    `Avery,Dup,AVERY-${stamp}@example.test,,`,
    "Dana,Existing,dana@lonestar.example.test,,",
    `Quinn,Import,quinn-${stamp}@example.test,,Import Co ${stamp} (fictional)`,
  ].join("\n");
  await page
    .getByLabel(/CSV file/)
    .setInputFiles({ name: "leads.csv", mimeType: "text/csv", buffer: Buffer.from(normal) });
  await page.getByRole("button", { name: "Upload and preview" }).click();
  await expect(page.getByText("4 data rows")).toBeVisible();
  await page.getByRole("button", { name: "Import contacts" }).click();
  await expect(page.getByText("Imported 2 contacts. Skipped 2 duplicates")).toBeVisible();
  expect(
    sql(`select count(*) from contacts where email in ('avery-${stamp}@example.test', 'quinn-${stamp}@example.test')`),
  ).toBe("2");
  expect(sql(`select count(*) from companies where name = 'Import Co ${stamp} (fictional)'`)).toBe("1");
  expect(sql(`select count(*) from files where org_id = '${MAIN_ORG}' and kind = 'contact_import'`)).not.toBe("0");
});

test("brand-limited user cannot see FPD deals; outsider sees nothing", async ({ page }) => {
  await signInFresh(page, "brandlimited@example.test");
  await page.goto("/mosley-dev/crm/deals");
  await expect(page.getByTestId("deal-card").filter({ hasText: "Trinity Paws local visibility" })).toBeVisible();
  await expect(page.getByTestId("deal-card").filter({ hasText: "Lone Star" })).toHaveCount(0);
  await expect(page.getByText("First Pass Data")).toHaveCount(0);

  await signInFresh(page, "outsider@example.test");
  const res = await page.goto("/mosley-dev/crm/deals");
  expect(res?.status()).toBe(404);
  await page.goto("/other-agency/crm/deals");
  await expect(page.getByTestId("deal-card")).toHaveCount(0);
});

test("notification digest goes to the local mail catcher only and needs the cron secret", async ({ request }) => {
  const denied = await request.post("/api/cron/notification-digest");
  expect(denied.status()).toBe(401);
  if (!process.env.CRON_SECRET) process.loadEnvFile(".env.local");
  const ok = await request.post("/api/cron/notification-digest", {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  expect(ok.status()).toBe(200);
  const body = (await ok.json()) as { emails: number };
  expect(body.emails).toBeGreaterThan(0);
  expect(sql(`select count(*) from notifications where read_at is null and digested_at is null`)).toBe("0");
});
