import { expect, test } from "@playwright/test";
import { enrollTotp, latestMessageFor, localAdminClient, mailCountFor, signInWithMagicLink } from "./helpers";

// Seed users from supabase/seed.sql (all invented).
const OWNER = "owner@example.test";
const PARTNER = "partner@example.test";
const BRAND_LIMITED = "brandlimited@example.test";
const VIEWER = "viewer@example.test";
const MAIN_ORG = "10000000-0000-4000-8000-000000000001";
const BRAND_369 = "20000000-0000-4000-8000-000000000002";

test("signed-out visitors are sent to /login", async ({ page }) => {
  await page.goto("/mosley-dev/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});

test("owner signs in by magic link, is forced through MFA enrollment, and sees both brands", async ({
  page,
  browser,
}) => {
  await signInWithMagicLink(page, OWNER);
  await expect(page).toHaveURL(/\/mfa$/);

  // MFA cannot be skipped: going straight to an app page lands back on /mfa.
  await page.goto("/mosley-dev/dashboard");
  await expect(page).toHaveURL(/\/mfa$/);

  await enrollTotp(page);
  await expect(page).toHaveURL(/\/mosley-dev\/dashboard$/);
  await expect(page.getByTestId("role")).toHaveText("owner");
  await expect(page.getByTestId("brand-card")).toHaveCount(2);
  await expect(page.getByTestId("brand-card").filter({ hasText: "First Pass Data" })).toBeVisible();
  await expect(page.getByTestId("brand-card").filter({ hasText: "369 Agentic Systems" })).toBeVisible();

  // Brand switcher narrows the dashboard.
  await page.getByLabel("Brand", { exact: true }).selectOption({ label: "369 Agentic Systems" });
  await expect(page.getByTestId("brand-card")).toHaveCount(1);
  await page.getByLabel("Brand", { exact: true }).selectOption({ label: "All brands" });
  await expect(page.getByTestId("brand-card")).toHaveCount(2);

  // Owner can open members.
  await page.goto("/mosley-dev/settings/members");
  await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
  await expect(page.getByTestId("member-list")).toContainText("Partner (dev)");

  // Inviting sends a sign-in link to the local mail catcher only.
  const invitee = `newhire-${Date.now()}@example.test`;
  await page.locator("#invite-email").fill(invitee);
  await page.locator("#invite-role").selectOption({ value: "viewer" });
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(`Invited ${invitee}`)).toBeVisible();
  await expect(page.getByTestId("member-list")).toContainText(invitee.split("@")[0]);

  // The invitee clicks the email link (token_hash flow) in their own browser and lands in the app.
  const inviteLink = await latestMessageFor(invitee, Date.now() - 60_000);
  expect(inviteLink).toContain("/auth/confirm?token_hash=");
  const inviteeContext = await browser.newContext();
  const inviteePage = await inviteeContext.newPage();
  await inviteePage.goto(inviteLink);
  await expect(inviteePage).toHaveURL(/\/mosley-dev\/dashboard$/);
  await expect(inviteePage.getByTestId("role")).toHaveText("viewer");
  await inviteeContext.close();
});

test("partner (operator) cannot open members", async ({ page }) => {
  await signInWithMagicLink(page, PARTNER);
  await enrollTotp(page);
  await expect(page).toHaveURL(/\/mosley-dev\/dashboard$/);
  await expect(page.getByRole("link", { name: "Members" })).toHaveCount(0);
  await page.goto("/mosley-dev/settings/members");
  await expect(page.getByText("Not allowed")).toBeVisible();
  await expect(page.getByTestId("member-list")).toHaveCount(0);
});

test("brand-limited user sees only 369", async ({ page }) => {
  await signInWithMagicLink(page, BRAND_LIMITED);
  await enrollTotp(page);
  await expect(page.getByTestId("brand-card")).toHaveCount(1);
  await expect(page.getByTestId("brand-card")).toContainText("369 Agentic Systems");
  await expect(page.getByText("First Pass Data")).toHaveCount(0);
});

test("viewer role signs in without MFA and has read-only brands", async ({ page }) => {
  await signInWithMagicLink(page, VIEWER);
  await expect(page).toHaveURL(/\/mosley-dev\/dashboard$/);
  await page.goto("/mosley-dev/settings/brands");
  await expect(page.getByRole("button", { name: "Save brand" })).toHaveCount(0);
});

test("brand-limited admin cannot invite without a brand: no email, no account, clear error", async ({ page }) => {
  // A fresh brand-limited admin (369 only), set up with the local service role.
  const admin = localAdminClient();
  const email = `bl-admin-${Date.now()}@example.test`;
  const { data: created, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  const { error: mErr } = await admin.from("memberships").insert({
    org_id: MAIN_ORG,
    user_id: created.user.id,
    role: "admin",
    brand_ids: [BRAND_369],
    status: "active",
  });
  if (mErr) throw mErr;

  await signInWithMagicLink(page, email);
  await enrollTotp(page);
  await expect(page).toHaveURL(/\/mosley-dev\/dashboard$/);
  await page.goto("/mosley-dev/settings/members");
  await expect(page.getByText("Brands (pick at least one of yours)")).toBeVisible();

  // Members whose brands are outside theirs (here, all-brand members like the owner) are locked.
  const ownerRow = page.getByTestId("member-list").locator("form").filter({ hasText: "Chris (dev)" });
  await expect(ownerRow.getByRole("button", { name: "Save" })).toBeDisabled();
  await expect(ownerRow).toContainText("outside your brands");

  const invitee = `bl-invitee-${Date.now()}@example.test`;
  const sentAt = Date.now();
  await page.locator("#invite-email").fill(invitee);
  await page.locator("#invite-role").selectOption({ value: "viewer" });
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(
    page.getByText("You can only invite people to brands you have access to. Pick at least one brand."),
  ).toBeVisible();

  // Nothing went out and no account was created.
  await page.waitForTimeout(1500); // the old bug sent mail before failing; give it time to land
  expect(await mailCountFor(invitee, sentAt)).toBe(0);
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 200 });
  expect(users.users.some((u) => u.email === invitee)).toBe(false);

  // With their brand ticked, the same invite works (the form resets after each submit).
  await page.locator("#invite-email").fill(invitee);
  await page.locator("#invite-role").selectOption({ value: "viewer" });
  await page.getByRole("checkbox", { name: "369 Agentic Systems" }).check();
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(`Invited ${invitee}`)).toBeVisible();
});
