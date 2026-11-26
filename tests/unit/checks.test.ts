import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DEFAULT_RULES, DEFAULT_RULE_SET } from "@/server/checks/default-rules";
import { effectiveRules, rulesVersion, runChecks } from "@/server/checks/engine";
import { luhnValid, smsSegments } from "@/server/checks/rules";
import type { CheckContext, CheckRule, DraftContent } from "@/server/checks/types";

// Assembled at runtime so the repo never holds a token-shaped literal (keeps the secret scan clean).
const FAKE_KEY = ["sk", "live", "FAKE0000000000000000"].join("_");

const ctx = (over: Partial<CheckContext> = {}): CheckContext => ({ kind: "other", marketplace: "other", ...over });
const keys = (content: DraftContent, c: CheckContext) => runChecks(content, c, DEFAULT_RULE_SET).map((r) => r.rule_key);
const blockers = (content: DraftContent, c: CheckContext) =>
  runChecks(content, c, DEFAULT_RULE_SET)
    .filter((r) => r.severity === "blocker")
    .map((r) => r.rule_key);

const amazon = ctx({
  kind: "listing",
  marketplace: "amazon",
  sourceData: { size_oz: 8, burn_time_hours: 45, title: "Candle 8 oz" },
});
const goodListing: DraftContent = {
  title: "Texas Wildflower Soy Candle, 8 oz",
  bullets: ["About 45 hours of burn time", "Hand-poured in small batches"],
  description: "A soy candle with a cotton wick.",
};

// Each rule: [rule_key, failing (content, ctx), passing (content, ctx)]
type Case = [string, DraftContent, CheckContext, DraftContent, CheckContext];
const cases: Case[] = [
  ["required.fields", { title: "Only a title" }, amazon, goodListing, amazon],
  [
    "length.limits",
    { body: "x".repeat(751) },
    ctx({ kind: "gbp_description" }),
    { body: "x".repeat(750) },
    ctx({ kind: "gbp_description" }),
  ],
  [
    "sms.segments",
    { body: `Bluebonnet: ${"word ".repeat(70)} Reply STOP to opt out` },
    ctx({ kind: "sms", brandName: "Bluebonnet" }),
    { body: "Bluebonnet: your order shipped. Reply STOP to opt out" },
    ctx({ kind: "sms", brandName: "Bluebonnet" }),
  ],
  [
    "claims.guaranteed",
    { body: "Guaranteed #1 ranking on Google" },
    ctx(),
    { body: "We improve how your listing reads." },
    ctx(),
  ],
  [
    "claims.superlatives",
    { body: "The best groomers in town" },
    ctx(),
    { body: "The best groomers in town", substantiation: "Fort Worth Weekly reader poll 2026" },
    ctx(),
  ],
  ["claims.medical", { body: "This candle cures insomnia" }, ctx(), { body: "A calm, cozy scent" }, ctx()],
  ["claims.fda", { body: "FDA approved wax" }, ctx(), { body: "Food-grade soy wax" }, ctx()],
  ["claims.pesticide", { body: "Kills fleas and ticks" }, ctx(), { body: "Gentle oatmeal shampoo" }, ctx()],
  [
    "claims.competitors",
    { title: "Better than Fictional Wax Co candles", bullets: ["a"], description: "b" },
    amazon,
    goodListing,
    amazon,
  ],
  ["claims.title_promo", { ...goodListing, title: "Soy Candle 8 oz - Free Shipping" }, amazon, goodListing, amazon],
  [
    "claims.all_caps",
    { ...goodListing, description: "AMAZING soy candle" },
    amazon,
    { ...goodListing, description: "Includes a USB gift tag" },
    amazon,
  ],
  ["claims.emoji", { ...goodListing, description: "Smells great 🔥" }, amazon, goodListing, amazon],
  ["spec.fidelity", { ...goodListing, description: "Load capacity 5,000 lb" }, amazon, goodListing, amazon],
  [
    "reviews.gating",
    { body: "If you loved your visit, leave us a review — otherwise call us" },
    ctx({ kind: "review_request" }),
    { body: "Thanks for visiting. We'd value an honest review: example.test/review" },
    ctx({ kind: "review_request" }),
  ],
  [
    "reviews.incentive",
    { body: "Get 10% off for leaving a review" },
    ctx({ kind: "review_request" }),
    { body: "Tell us how we did in a review." },
    ctx({ kind: "review_request" }),
  ],
  [
    "reviews.positive_only",
    { body: "Leave us a 5-star review" },
    ctx({ kind: "review_request" }),
    { body: "Leave us an honest review" },
    ctx({ kind: "review_request" }),
  ],
  [
    "review_reply.personal_data",
    { body: "Sorry about order #48213, call 817-555-0101" },
    ctx({ kind: "review_reply" }),
    { body: "Thanks, Sam. We're sorry and will reach out." },
    ctx({ kind: "review_reply" }),
  ],
  [
    "review_reply.tone",
    { body: "That never happened." },
    ctx({ kind: "review_reply" }),
    { body: "We're sorry to hear that." },
    ctx({ kind: "review_reply" }),
  ],
  [
    "gbp.contact_in_post",
    { body: "Call 817-555-0102 to book" },
    ctx({ kind: "gbp_post" }),
    { body: "Book with the button below" },
    ctx({ kind: "gbp_post" }),
  ],
  [
    "sms.stop",
    { body: "Trinity Paws: your appointment is tomorrow at 9." },
    ctx({ kind: "sms", brandName: "Trinity Paws" }),
    { body: "Trinity Paws: your appointment is tomorrow at 9. Reply STOP to opt out" },
    ctx({ kind: "sms", brandName: "Trinity Paws" }),
  ],
  [
    "sms.brand",
    { body: "Your appointment is tomorrow. Reply STOP to opt out" },
    ctx({ kind: "sms", brandName: "Trinity Paws" }),
    { body: "Trinity Paws: see you tomorrow. Reply STOP to opt out" },
    ctx({ kind: "sms", brandName: "Trinity Paws" }),
  ],
  [
    "sms.shortener",
    { body: "Trinity Paws: book at bit.ly/abc Reply STOP to opt out" },
    ctx({ kind: "sms", brandName: "Trinity Paws" }),
    { body: "Trinity Paws: book at example.test/book Reply STOP to opt out" },
    ctx({ kind: "sms", brandName: "Trinity Paws" }),
  ],
  [
    "sms.shaft",
    { body: "Trinity Paws: free wine Friday. Reply STOP to opt out" },
    ctx({ kind: "sms", brandName: "Trinity Paws" }),
    { body: "Trinity Paws: free nail trim Friday. Reply STOP to opt out" },
    ctx({ kind: "sms", brandName: "Trinity Paws" }),
  ],
  [
    "email.canspam",
    { subject: "News", body: "Hello from us." },
    ctx({ kind: "email" }),
    { subject: "News", body: "Hello. 100 Example Way, Fort Worth TX. Unsubscribe: example.test/u" },
    ctx({ kind: "email" }),
  ],
  ["honesty.urgency", { body: "Act now, only today!" }, ctx(), { body: "Open Tuesday to Saturday." }, ctx()],
  [
    "honesty.statistics",
    { body: "93% of owners recommend us" },
    ctx({ kind: "gbp_post" }),
    { body: "93% of owners recommend us", substantiation: "Source: 2026 client survey, n=40" },
    ctx({ kind: "gbp_post" }),
  ],
  [
    "honesty.testimonial",
    { body: '"Best groomer we have ever used" — Pat' },
    ctx(),
    { body: '"Best groomer we have ever used" — Pat', substantiation: "Google review, 2026-10-02" },
    ctx(),
  ],
  ["data.secrets", { body: `key ${FAKE_KEY}` }, ctx(), { body: "Keys live in the vault, not here." }, ctx()],
  ["data.card_number", { body: "Card 4111 1111 1111 1111" }, ctx(), { body: "Order 1234 5678" }, ctx()],
  ["data.ssn", { body: "SSN 123-45-6789" }, ctx(), { body: "Call 817-555-0101" }, ctx()],
];

const competitorRules: CheckRule[] = DEFAULT_RULE_SET.map((r) =>
  r.rule_key === "claims.competitors" ? { ...r, params: { ...r.params, names: ["Fictional Wax Co"] } } : r,
);

describe("checks engine: every seed rule has a failing and a passing fixture", () => {
  it("covers every seed rule", () => {
    expect(new Set(cases.map((c) => c[0]))).toEqual(new Set(DEFAULT_RULES.map((r) => r.rule_key)));
  });
  for (const [key, bad, badCtx, good, goodCtx] of cases) {
    it(`${key}: fails the bad fixture and passes the good one`, () => {
      const rules = key === "claims.competitors" ? competitorRules : DEFAULT_RULE_SET;
      expect(runChecks(bad, badCtx, rules).map((r) => r.rule_key)).toContain(key);
      expect(runChecks(good, goodCtx, rules).map((r) => r.rule_key)).not.toContain(key);
    });
  }
});

describe("checks engine: kickoff §G must-fail fixtures produce a blocker", () => {
  it("Guaranteed #1 ranking on Google", () => {
    expect(blockers({ body: "Guaranteed #1 ranking on Google" }, ctx({ kind: "gbp_post" }))).toContain(
      "claims.guaranteed",
    );
  });
  it("If you loved your visit, leave us 5 stars — otherwise call us", () => {
    const b = blockers(
      { body: "If you loved your visit, leave us 5 stars — otherwise call us" },
      ctx({ kind: "review_request" }),
    );
    expect(b).toContain("reviews.gating");
  });
  it("Get 10% off for leaving a review", () => {
    expect(blockers({ body: "Get 10% off for leaving a review" }, ctx({ kind: "review_request" }))).toContain(
      "reviews.incentive",
    );
  });
  it("a 751-character GBP description", () => {
    expect(blockers({ body: "a".repeat(751) }, ctx({ kind: "gbp_description" }))).toContain("length.limits");
  });
  it("an SMS body without STOP wording", () => {
    expect(
      blockers({ body: "Trinity Paws: see you tomorrow" }, ctx({ kind: "sms", brandName: "Trinity Paws" })),
    ).toContain("sms.stop");
  });
  it("a fake API key", () => {
    expect(blockers({ body: `use ${FAKE_KEY}` }, ctx())).toContain("data.secrets");
  });
  it("a numeric spec not in the job item's source data", () => {
    expect(blockers({ ...goodListing, bullets: ["Load capacity 5,000 lb"] }, amazon)).toContain("spec.fidelity");
  });
  it("a clean listing passes with no blockers", () => {
    expect(blockers(goodListing, amazon)).toEqual([]);
  });
});

describe("checks engine: spans, rule data and versions", () => {
  it("results carry a span for highlighting", () => {
    const [r] = runChecks({ body: "x Guaranteed #1 ranking" }, ctx(), DEFAULT_RULE_SET).filter(
      (x) => x.rule_key === "claims.guaranteed",
    );
    expect(r.span).toEqual({ field: "body", start: 2, end: 2 + "Guaranteed #1".length });
  });
  it("limits are data: changing params changes the verdict", () => {
    const rules = DEFAULT_RULE_SET.map((r) =>
      r.rule_key === "length.limits"
        ? { ...r, params: { limits: [{ kind: "gbp_description", field: "body", max: 800 }] } }
        : r,
    );
    expect(
      runChecks({ body: "a".repeat(751) }, ctx({ kind: "gbp_description" }), rules).map((r) => r.rule_key),
    ).not.toContain("length.limits");
  });
  it("inactive rules are skipped and org rows override global ones", () => {
    const rows = [
      ...DEFAULT_RULE_SET.map((r) => ({ ...r, org_id: null })),
      { ...DEFAULT_RULE_SET.find((r) => r.rule_key === "claims.fda")!, org_id: "org", active: false, version: 2 },
    ];
    const eff = effectiveRules(rows);
    expect(eff.find((r) => r.rule_key === "claims.fda")!.active).toBe(false);
    expect(runChecks({ body: "FDA approved" }, ctx(), eff).map((r) => r.rule_key)).not.toContain("claims.fda");
    expect(rulesVersion(eff)).not.toEqual(rulesVersion(DEFAULT_RULE_SET));
    expect(rulesVersion(DEFAULT_RULE_SET)).toMatch(/^r-[0-9a-f]{12}$/);
  });
  it("warnings never block", () => {
    expect(keys({ body: "Act now" }, ctx())).toContain("honesty.urgency");
    expect(blockers({ body: "Act now" }, ctx())).toEqual([]);
  });
});

describe("helpers", () => {
  it("SMS segment math", () => {
    expect(smsSegments("a".repeat(160))).toMatchObject({ encoding: "GSM-7", segments: 1 });
    expect(smsSegments("a".repeat(161))).toMatchObject({ encoding: "GSM-7", segments: 2 });
    expect(smsSegments("€".repeat(80))).toMatchObject({ encoding: "GSM-7", units: 160, segments: 1 });
    expect(smsSegments("é".repeat(10) + "ł")).toMatchObject({ encoding: "UCS-2", segments: 1 });
    expect(smsSegments("ł".repeat(71))).toMatchObject({ encoding: "UCS-2", segments: 2 });
  });
  it("Luhn", () => {
    expect(luhnValid("4111111111111111")).toBe(true);
    expect(luhnValid("4111111111111112")).toBe(false);
  });
});

describe("seed migration", () => {
  it("matches DEFAULT_RULES exactly", () => {
    const sql = readFileSync("supabase/migrations/20261126020400_phase2_check_rules_seed.sql", "utf8");
    const json = sql.split("$rules$")[1];
    expect(JSON.parse(json)).toEqual(DEFAULT_RULES);
  });
});
