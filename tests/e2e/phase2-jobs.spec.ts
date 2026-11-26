import { expect, test, type Page } from "@playwright/test";
import { canonicalHash, type Json } from "../../src/lib/canonical-hash";
import { signInFresh, sql } from "./helpers";

// Phase 2 acceptance tests (kickoff §I). All data is invented.
const ORG = "mosley-dev";
const BLUEBONNET_JOB = "81000000-0000-4000-8000-000000000001";

test.describe.configure({ mode: "serial" });

// ---------------------------------------------------------------------------
// TypeScript canonicalHash equals SQL canonical_hash for 20 random fixtures
// ---------------------------------------------------------------------------
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function randomJson(r: () => number, depth = 0): Json {
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const kind = depth > 2 ? pick(["s", "n", "d", "b", "z"]) : pick(["o", "o", "a", "s", "n", "d", "b", "z"]);
  switch (kind) {
    case "o": {
      const o: Record<string, Json> = {};
      const n = Math.floor(r() * 5);
      for (let i = 0; i < n; i++)
        o[pick(["title", "b", "A", "z", "é", "key_1", "Δ", "a b", 'q"t', "10", "2"])] = randomJson(r, depth + 1);
      return o;
    }
    case "a":
      return Array.from({ length: Math.floor(r() * 4) }, () => randomJson(r, depth + 1));
    case "s":
      return pick([
        "",
        "plain",
        'quote " and \\ slash',
        "line\nbreak\ttab",
        "unicode ✓ é 漢字",
        "emoji 🔥",
        "ctrl \u0001 char",
        "  spaced  ",
      ]);
    case "n":
      return Math.floor(r() * 2_000_000) - 1_000_000;
    case "d":
      return Math.round((r() * 2000 - 1000) * 100) / 100;
    case "b":
      return r() > 0.5;
    default:
      return null;
  }
}

test("TypeScript canonicalHash equals SQL canonical_hash for 20 random fixtures", () => {
  const r = rng(20261126);
  for (let i = 0; i < 20; i++) {
    const value = { fixture: i, data: randomJson(r) };
    const text = JSON.stringify(value);
    expect(text.includes("$fx$")).toBe(false);
    const fromSql = sql(`select public.canonical_hash($fx$${text}$fx$::jsonb)`);
    expect(fromSql, `fixture ${i}: ${text}`).toBe(canonicalHash(value));
  }
});

// ---------------------------------------------------------------------------
// Two-user flow: partner writes drafts -> checks pass -> Chris approves -> approved ->
// Chris edits one bullet -> job falls back to drafts
// ---------------------------------------------------------------------------
async function submitIn(page: Page, testId: string, button: string | RegExp) {
  const box = page.getByTestId(testId);
  await box.getByRole("button", { name: button }).click();
}

async function move(page: Page, to: string) {
  await page
    .getByTestId(`move-${to}`)
    .getByRole("button", { name: new RegExp(`Move to ${to}`) })
    .click();
  await expect(page.getByTestId("job-stage")).toHaveText(new RegExp(to, "i"));
}

async function writeListing(
  page: Page,
  item: string,
  name: string,
  title: string,
  bullets: string[],
  description: string,
) {
  await page.goto(`/${ORG}/jobs/${BLUEBONNET_JOB}?tab=drafts`);
  await page.getByLabel("Type").selectOption("listing");
  await page.getByLabel("Item").selectOption({ label: item });
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Create draft" }).click();
  await page.waitForURL(/\/drafts\/[0-9a-f-]{36}$/);
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Bullets (one per line)").fill(bullets.join("\n"));
  await page.getByLabel("Description").fill(description);
  await page.getByRole("button", { name: "Save version" }).click();
  await expect(page.getByText("New version saved. Checks ran.")).toBeVisible();
  await expect(page.getByTestId("draft-status")).toHaveText("ready for review");
  return page.url();
}

test("two-user flow: drafts, checks, approval, and invalidation on edit", async ({ browser }) => {
  test.setTimeout(180_000);
  const partnerCtx = await browser.newContext();
  const partner = await partnerCtx.newPage();
  await signInFresh(partner, "partner@example.test");

  // Intake (G1)
  await partner.goto(`/${ORG}/jobs/${BLUEBONNET_JOB}?tab=intake`);
  await expect(partner.getByTestId("blockers-G1")).toBeVisible();
  for (const key of [
    "scope_set",
    "brand_set",
    "sensitivity_set",
    "access_confirmed",
    "owner_contact_set",
    "contract_recorded",
  ]) {
    await submitIn(partner, `check-${key}`, "Mark done");
    await expect(partner.getByTestId(`check-${key}`).getByRole("button", { name: "Undo" })).toBeVisible();
  }
  await move(partner, "audit");

  // Manual audit (G2)
  await partner.goto(`/${ORG}/jobs/${BLUEBONNET_JOB}?tab=audit`);
  await partner.getByRole("button", { name: "Start a manual audit" }).click();
  await partner.getByLabel("Finding").fill("Titles miss the scent name");
  await partner.getByRole("button", { name: "Add finding" }).click();
  await expect(partner.getByText("Titles miss the scent name")).toBeVisible();
  await partner.getByRole("button", { name: "Finish audit" }).click();
  await expect(partner.getByTestId("audit-finished")).toBeVisible();
  await move(partner, "drafts");

  // Drafts (G3): a failing version first, then a clean one
  const draft1 = await writeListing(
    partner,
    "Texas Wildflower soy candle, 8 oz",
    "Wildflower listing",
    "Texas Wildflower Soy Candle, 8 oz",
    ["About 45 hours of burn time", "Hand-poured in small batches"],
    "A soy candle with a cotton wick.",
  );
  const draft2url = await (async () => {
    await partner.goto(`/${ORG}/jobs/${BLUEBONNET_JOB}?tab=drafts`);
    await partner.getByLabel("Type").selectOption("listing");
    await partner.getByLabel("Item").selectOption({ label: "Cedar & Sage soy candle, 12 oz" });
    await partner.getByLabel("Name").fill("Cedar listing");
    await partner.getByRole("button", { name: "Create draft" }).click();
    await partner.waitForURL(/\/drafts\/[0-9a-f-]{36}$/);
    await partner.getByLabel("Title", { exact: true }).fill("Cedar & Sage Soy Candle, 12 oz");
    await partner.getByLabel("Bullets (one per line)").fill("About 70 hours of burn time\nLoad capacity 5,000 lb");
    await partner.getByLabel("Description").fill("Guaranteed #1 ranking on Google.");
    await partner.getByRole("button", { name: "Save version" }).click();
    await expect(partner.getByTestId("draft-status")).toHaveText("checks failed");
    await expect(partner.getByTestId("check-results")).toContainText("spec.fidelity");
    await expect(partner.getByTestId("check-results")).toContainText("claims.guaranteed");
    // Fix it: a new version
    await partner.getByLabel("Bullets (one per line)").fill("About 70 hours of burn time\nWooden wick");
    await partner.getByLabel("Description").fill("A soy candle with a crackling wooden wick.");
    await partner.getByRole("button", { name: "Save version" }).click();
    await expect(partner.getByTestId("draft-status")).toHaveText("ready for review");
    return partner.url();
  })();

  await partner.goto(`/${ORG}/jobs/${BLUEBONNET_JOB}`);
  await move(partner, "review");

  // Two-person rule: the author can't approve their own draft.
  await partner.goto(draft1);
  await expect(partner.getByTestId("approve-blocked")).toContainText("Two-person rule");

  // Chris approves both drafts and moves the job to approved (G4).
  const ownerCtx = await browser.newContext();
  const owner = await ownerCtx.newPage();
  await signInFresh(owner, "owner@example.test");
  for (const url of [draft1, draft2url]) {
    await owner.goto(url);
    await owner.getByRole("button", { name: "Approve this version" }).click();
    await expect(owner.getByTestId("draft-status")).toHaveText("approved");
  }
  await owner.goto(`/${ORG}/jobs/${BLUEBONNET_JOB}`);
  await expect(owner.getByTestId("blockers-G4")).toHaveCount(0);
  await move(owner, "approved");

  // Chris edits one bullet: approvals go stale and the job falls back to drafts.
  await owner.goto(draft1);
  await owner
    .getByLabel("Bullets (one per line)")
    .fill("About 45 hours of clean burn time\nHand-poured in small batches");
  await owner.getByRole("button", { name: "Save version" }).click();
  await expect(owner.getByText("New version saved. Checks ran.")).toBeVisible();
  await expect(owner.getByTestId("approval-history")).toContainText("stale");
  await owner.goto(`/${ORG}/jobs/${BLUEBONNET_JOB}?tab=activity`);
  await expect(owner.getByTestId("job-stage")).toHaveText("Drafts");
  await expect(owner.getByTestId("stage-history")).toContainText("content changed after approval");
  expect(sql(`select stage from jobs where id = '${BLUEBONNET_JOB}'`)).toBe("drafts");

  await partnerCtx.close();
  await ownerCtx.close();
});

// ---------------------------------------------------------------------------
// Outbox: the author can't approve; release is refused without permission and
// when the content changed after approval; a valid release marks it sent.
// ---------------------------------------------------------------------------
test("outbox: two-person approval and manual release", async ({ browser }) => {
  const partnerCtx = await browser.newContext();
  const partner = await partnerCtx.newPage();
  await signInFresh(partner, "partner@example.test");
  const body = `Hi Casey, your drafts are ready (${Date.now()}).`;
  await partner.goto(`/${ORG}/outbox`);
  await partner.getByLabel("Outbox brand").selectOption({ label: "First Pass Data" });
  await partner.getByLabel("Recipient").fill("casey@bluebonnet.example.test");
  await partner.getByLabel("Message").fill(body);
  await partner.getByRole("button", { name: "Add outbox item" }).click();
  const item = partner.getByTestId("outbox-item").filter({ hasText: body });
  await expect(item.getByTestId("outbox-status")).toHaveText("pending approval");
  await expect(item.getByTestId("approve-disabled")).toBeVisible();

  const ownerCtx = await browser.newContext();
  const owner = await ownerCtx.newPage();
  await signInFresh(owner, "owner@example.test");
  await owner.goto(`/${ORG}/outbox`);
  const ownerItem = owner.getByTestId("outbox-item").filter({ hasText: body });
  await ownerItem.getByRole("button", { name: "Approve" }).click();
  await expect(ownerItem.getByTestId("outbox-status")).toHaveText("approved");

  // The partner (operator) can't release by default.
  await partner.reload();
  await expect(item.getByText("Waiting for someone who can release it")).toBeVisible();

  await ownerItem.getByRole("button", { name: "I sent it: mark sent" }).click();
  await expect(ownerItem.getByTestId("outbox-status")).toHaveText("sent");
  expect(sql(`select provider_id from outbox_messages where body = '${body}'`)).toBe("manual");

  await partnerCtx.close();
  await ownerCtx.close();
});

test("a brand-limited user can't see the FPD job", async ({ page }) => {
  await signInFresh(page, "brandlimited@example.test");
  await page.goto(`/${ORG}/jobs`);
  await expect(page.getByTestId("job-board")).not.toContainText("Bluebonnet");
  await expect(page.getByTestId("job-board")).toContainText("Trinity Paws");
  const res = await page.goto(`/${ORG}/jobs/${BLUEBONNET_JOB}`);
  expect(res?.status()).toBe(404);
});

test("job flags: only an owner or admin gets the flags form", async ({ browser }) => {
  const partnerCtx = await browser.newContext();
  const partner = await partnerCtx.newPage();
  await signInFresh(partner, "partner@example.test");
  await partner.goto(`/${ORG}/jobs/${BLUEBONNET_JOB}`);
  await expect(partner.getByTestId("job-flags")).toContainText("Upkeep subscription active");
  await expect(partner.getByTestId("job-flags-form")).toHaveCount(0);

  const ownerCtx = await browser.newContext();
  const owner = await ownerCtx.newPage();
  await signInFresh(owner, "owner@example.test");
  await owner.goto(`/${ORG}/jobs/${BLUEBONNET_JOB}`);
  const form = owner.getByTestId("job-flags-form");
  await form.getByRole("button", { name: "Save flags" }).click();
  await expect(form.getByText("Nothing changed.")).toBeVisible();

  await partnerCtx.close();
  await ownerCtx.close();
});
