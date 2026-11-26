import { expect, test } from "@playwright/test";
import { enrollTotp, signInWithMagicLink } from "./helpers";

// Seed users from supabase/seed.sql (all invented).
const OWNER = "owner@example.test";
const PARTNER = "partner@example.test";
const BRAND_LIMITED = "brandlimited@example.test";
const VIEWER = "viewer@example.test";

test("signed-out visitors are sent to /login", async ({ page }) => {
  await page.goto("/mosley-dev/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});

test("owner signs in by magic link, is forced through MFA enrollment, and sees both brands", async ({ page }) => {
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
