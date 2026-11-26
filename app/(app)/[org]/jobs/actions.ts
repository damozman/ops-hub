"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAppUser } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { getOrgBySlug, hasPerm, type Permission } from "@/server/permissions";
import { fail, ok, optStr, str, type ActionState } from "@/server/crm/action-utils";
import { runChecksForVersion } from "@/server/checks/run";
import { senderFor } from "@/server/outbox/sender";
import { zonedTimeToUtc } from "@/lib/time";
import type { Json } from "@/types/db";

// Every action: signed-in + MFA, org membership (404 otherwise), a permission check here,
// and the same checks again in RLS and in the database functions. Triggers write audit_log
// and events. State changes (stage, approvals, outbox status) only happen inside functions.

const uuid = z.uuid();

async function ctx(formData: FormData, perm: Permission) {
  await requireAppUser();
  const org = await getOrgBySlug(str(formData.get("org")));
  const allowed = await hasPerm(org.id, perm);
  return { org, allowed, supabase: await createSupabaseServerClient() };
}

/** Database refusals in plain words. Gate and rule messages are written for people, so they pass through. */
function jobFail(error: { code?: string; message?: string } | null): ActionState | null {
  if (!error) return null;
  const msg = error.message ?? "";
  if (error.code === "42501")
    return fail(
      msg && !msg.includes("row-level security") && !msg.includes("permission denied")
        ? msg
        : "Your role isn't allowed to make this change.",
    );
  if (["P0001", "22023", "23514", "23503", "23505", "0A000", "23502"].includes(error.code ?? ""))
    return fail(msg || "That change isn't allowed.");
  console.error("jobs action failed", error.code);
  return fail("Something went wrong. Nothing was changed.");
}

function refresh(slug: string) {
  revalidatePath(`/${slug}`, "layout");
}

function id(formData: FormData, name: string): string | null {
  const v = str(formData.get(name));
  return uuid.safeParse(v).success ? v : null;
}

type JsonObject = { [key: string]: Json };

function parseJson(text: string, fallback: JsonObject): JsonObject | undefined {
  if (!text.trim()) return fallback;
  try {
    const v = JSON.parse(text) as Json;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as JsonObject) : undefined;
  } catch {
    return undefined;
  }
}

type Db = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** brand_id of a visible job (child rows copy it; the database trigger enforces the same value). */
async function jobBrand(supabase: Db, jobId: string): Promise<string | null> {
  const { data } = await supabase.from("jobs").select("brand_id").eq("id", jobId).maybeSingle();
  return data?.brand_id ?? null;
}

function dueAt(formData: FormData): string | null {
  const d = str(formData.get("due_date"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return zonedTimeToUtc(`${d}T17:00`)?.toISOString() ?? null;
}

// ---------------------------------------------------------------------------
// Client accounts and jobs
// ---------------------------------------------------------------------------
export async function createClientAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, allowed, supabase } = await ctx(formData, "jobs.write");
  if (!allowed) return fail("Your role can't create client accounts.");
  const brand = id(formData, "brand_id");
  const company = id(formData, "company_id");
  if (!brand || !company) return fail("Pick a brand and a company.");
  const sensitivity =
    str(formData.get("data_sensitivity")) === "client_confidential" ? "client_confidential" : "public_only";
  const ai = str(formData.get("ai_policy")) === "local_only" ? "local_only" : "default";
  const { error } = await supabase.from("client_accounts").insert({
    org_id: org.id,
    brand_id: brand,
    company_id: company,
    data_sensitivity: sensitivity,
    ai_policy: ai,
    primary_contact_id: id(formData, "primary_contact_id"),
  });
  if (error?.code === "23505") return fail("That company already has a client account for this brand.");
  const f = jobFail(error);
  if (f) return f;
  refresh(org.slug);
  return ok("Client account created.");
}

const jobSchema = z.object({
  title: z.string().min(1, "Give the job a title.").max(200),
  offer: z.enum(["A", "B"]),
  contract_ref: z.string().max(200),
});

export async function createJob(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, allowed, supabase } = await ctx(formData, "jobs.write");
  if (!allowed) return fail("Your role can't create jobs.");
  const parsed = jobSchema.safeParse({
    title: str(formData.get("title")),
    offer: str(formData.get("offer")),
    contract_ref: str(formData.get("contract_ref")),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  const account = id(formData, "client_account_id");
  if (!account) return fail("Pick a client account.");
  const { data: acct } = await supabase.from("client_accounts").select("brand_id").eq("id", account).maybeSingle();
  if (!acct) return fail("Client account not found.");
  const { data, error } = await supabase
    .from("jobs")
    .insert({
      org_id: org.id,
      brand_id: acct.brand_id,
      client_account_id: account,
      offer: parsed.data.offer,
      title: parsed.data.title,
      contract_ref: parsed.data.contract_ref || null,
      assignee_user_id: id(formData, "assignee_user_id"),
      reviewer_user_id: id(formData, "reviewer_user_id"),
      due_at: dueAt(formData),
      requires_client_approval: formData.get("requires_client_approval") === "on",
    })
    .select("id")
    .single();
  const f = jobFail(error);
  if (f) return f;
  refresh(org.slug);
  redirect(`/${org.slug}/jobs/${data!.id}`);
}

export async function updateJob(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, allowed, supabase } = await ctx(formData, "jobs.write");
  if (!allowed) return fail("Your role can't edit jobs.");
  const jobId = id(formData, "job_id");
  if (!jobId) return fail("Bad job id.");
  const title = str(formData.get("title"));
  if (!title || title.length > 200) return fail("Give the job a title.");
  const scope = parseJson(str(formData.get("scope")), {});
  if (scope === undefined) return fail("Scope must be a JSON object.");
  const { error } = await supabase
    .from("jobs")
    .update({
      title,
      contract_ref: optStr(formData.get("contract_ref")),
      assignee_user_id: id(formData, "assignee_user_id"),
      reviewer_user_id: id(formData, "reviewer_user_id"),
      due_at: dueAt(formData),
      scope,
      requires_client_approval: formData.get("requires_client_approval") === "on",
      subscription_active: formData.get("subscription_active") === "on",
    })
    .eq("id", jobId)
    .eq("org_id", org.id);
  const f = jobFail(error);
  if (f) return f;
  refresh(org.slug);
  return ok("Job saved.");
}

export async function transitionJob(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, allowed, supabase } = await ctx(formData, "jobs.transition");
  if (!allowed) return fail("Your role can't move jobs.");
  const jobId = id(formData, "job_id");
  const to = str(formData.get("to"));
  if (!jobId || !to) return fail("Bad request.");
  const { error } = await supabase.rpc("transition_job", {
    p_job: jobId,
    p_to: to,
    p_reason: optStr(formData.get("reason")) ?? undefined,
    p_override: formData.get("override") === "on",
  });
  const f = jobFail(error);
  if (f) return f;
  refresh(org.slug);
  return ok(`Moved to ${to}.`);
}

// ---------------------------------------------------------------------------
// Job items, checklists, audits
// ---------------------------------------------------------------------------
export async function addJobItem(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, allowed, supabase } = await ctx(formData, "jobs.write");
  if (!allowed) return fail("Your role can't edit jobs.");
  const jobId = id(formData, "job_id");
  const title = str(formData.get("title"));
  if (!jobId || !title) return fail("Give the item a title.");
  const source = parseJson(str(formData.get("source_data")), {});
  if (source === undefined) return fail("Source data must be a JSON object.");
  const kind = z.enum(["listing", "location", "asset"]).safeParse(str(formData.get("kind")));
  const market = z
    .enum(["amazon", "walmart", "shopify", "gbp", "openai_feed", "other"])
    .safeParse(str(formData.get("marketplace")));
  if (!kind.success || !market.success) return fail("Pick a kind and marketplace.");
  const brand = await jobBrand(supabase, jobId);
  if (!brand) return fail("Job not found.");
  const { error } = await supabase.from("job_items").insert({
    org_id: org.id,
    brand_id: brand,
    job_id: jobId,
    kind: kind.data,
    marketplace: market.data,
    title,
    external_ref: optStr(formData.get("external_ref")),
    source_data: source,
  });
  const f = jobFail(error);
  if (f) return f;
  refresh(org.slug);
  return ok("Item added.");
}

export async function setChecklistItem(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, allowed, supabase } = await ctx(formData, "jobs.write");
  if (!allowed) return fail("Your role can't edit checklists.");
  const jobId = id(formData, "job_id");
  if (!jobId) return fail("Bad job id.");
  const { error } = await supabase.rpc("set_checklist_item", {
    p_job: jobId,
    p_list: str(formData.get("list")),
    p_key: str(formData.get("key")),
    p_done: str(formData.get("done")) === "true",
    p_evidence: optStr(formData.get("evidence")) ?? undefined,
  });
  const f = jobFail(error);
  if (f) return f;
  refresh(org.slug);
  return ok("Saved.");
}

export async function startAudit(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, allowed, supabase } = await ctx(formData, "jobs.write");
  if (!allowed) return fail("Your role can't run audits.");
  const jobId = id(formData, "job_id");
  if (!jobId) return fail("Bad job id.");
  const brand = await jobBrand(supabase, jobId);
  if (!brand) return fail("Job not found.");
  const { error } = await supabase
    .from("audits")
    .insert({ org_id: org.id, brand_id: brand, job_id: jobId, engine: "manual" });
  const f = jobFail(error);
  if (f) return f;
  refresh(org.slug);
  return ok("Manual audit started.");
}

export async function addFinding(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, allowed, supabase } = await ctx(formData, "jobs.write");
  if (!allowed) return fail("Your role can't edit audits.");
  const auditId = id(formData, "audit_id");
  const message = str(formData.get("message"));
  const severity = z.enum(["blocker", "major", "minor", "info"]).safeParse(str(formData.get("severity")));
  if (!auditId || !message || !severity.success) return fail("Describe the finding and pick a severity.");
  const { data: audit } = await supabase.from("audits").select("brand_id").eq("id", auditId).maybeSingle();
  if (!audit) return fail("Audit not found.");
  const { error } = await supabase.from("audit_findings").insert({
    org_id: org.id,
    brand_id: audit.brand_id,
    audit_id: auditId,
    job_item_id: id(formData, "job_item_id"),
    severity: severity.data,
    field: optStr(formData.get("field")),
    message: message.slice(0, 2000),
  });
  const f = jobFail(error);
  if (f) return f;
  refresh(org.slug);
  return ok("Finding added.");
}

export async function finishAudit(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, allowed, supabase } = await ctx(formData, "jobs.write");
  if (!allowed) return fail("Your role can't edit audits.");
  const auditId = id(formData, "audit_id");
  if (!auditId) return fail("Bad audit id.");
  const scoreText = str(formData.get("score"));
  const score = scoreText === "" ? null : Number(scoreText);
  if (score !== null && (!Number.isFinite(score) || score < 0 || score > 100)) return fail("Score is 0 to 100.");
  const { error } = await supabase
    .from("audits")
    .update({ status: "finished", score, rules_version: optStr(formData.get("rules_version")) ?? "manual-v1" })
    .eq("id", auditId)
    .eq("org_id", org.id);
  const f = jobFail(error);
  if (f) return f;
  refresh(org.slug);
  return ok("Audit finished.");
}

// ---------------------------------------------------------------------------
// Drafts, versions, checks
// ---------------------------------------------------------------------------
const lines = (v: FormDataEntryValue | null) =>
  str(v)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

/** Builds version content from the editor fields for the draft's kind. Empty optional fields are left out. */
function contentFromForm(kind: string, formData: FormData): Record<string, Json> {
  const c: Record<string, Json> = {};
  const set = (k: string, v: Json | null | undefined) => {
    if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) return;
    c[k] = v;
  };
  if (kind === "listing") {
    set("title", str(formData.get("title")));
    set("bullets", lines(formData.get("bullets")));
    set("description", str(formData.get("description")));
    set("backend_keywords", str(formData.get("backend_keywords")));
  } else {
    if (kind === "email") set("subject", str(formData.get("subject")));
    set("body", str(formData.get("body")));
  }
  if (kind === "email" && formData.get("marketing") !== "on") c.marketing = false;
  if (kind === "sms" && formData.get("first_message") !== "on") c.first_message = false;
  set("substantiation", str(formData.get("substantiation")));
  return c;
}

async function brandName(supabase: Db, brandId: string) {
  const { data } = await supabase.from("brands").select("name").eq("id", brandId).maybeSingle();
  return data?.name;
}

async function writeVersion(
  supabase: Db,
  orgId: string,
  draft: { id: string; kind: string; brand_id: string },
  formData: FormData,
): Promise<ActionState | { versionId: string }> {
  const content = contentFromForm(draft.kind, formData);
  if (Object.keys(content).length === 0) return fail("Write something first.");
  if (JSON.stringify(content).length > 100_000) return fail("That draft is too long.");
  const { data, error } = await supabase
    .from("draft_versions")
    // version and content_hash are set by the database trigger.
    .insert({ org_id: orgId, brand_id: draft.brand_id, draft_id: draft.id, content })
    .select("id")
    .single();
  const f = jobFail(error);
  if (f) return f;
  // Checks run on every version insert (results are recorded by the server, never by the browser).
  await runChecksForVersion(data!.id, { brandName: await brandName(supabase, draft.brand_id) });
  return { versionId: data!.id };
}

export async function createDraft(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, allowed, supabase } = await ctx(formData, "drafts.write");
  if (!allowed) return fail("Your role can't write drafts.");
  const jobId = id(formData, "job_id");
  const kind = z
    .enum(["listing", "gbp_description", "gbp_post", "review_reply", "review_request", "sms", "email", "other"])
    .safeParse(str(formData.get("kind")));
  if (!jobId || !kind.success) return fail("Pick a draft type.");
  const brand = await jobBrand(supabase, jobId);
  if (!brand) return fail("Job not found.");
  const { data: draft, error } = await supabase
    .from("drafts")
    .insert({
      org_id: org.id,
      brand_id: brand,
      job_id: jobId,
      kind: kind.data,
      title: optStr(formData.get("draft_title")),
      job_item_id: id(formData, "job_item_id"),
    })
    .select("id, kind, brand_id")
    .single();
  const f = jobFail(error);
  if (f) return f;
  refresh(org.slug);
  redirect(`/${org.slug}/jobs/${jobId}/drafts/${draft!.id}`);
}

export async function saveDraftVersion(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, allowed, supabase } = await ctx(formData, "drafts.write");
  if (!allowed) return fail("Your role can't write drafts.");
  const draftId = id(formData, "draft_id");
  if (!draftId) return fail("Bad draft id.");
  const { data: draft } = await supabase
    .from("drafts")
    .select("id, kind, brand_id")
    .eq("id", draftId)
    .eq("org_id", org.id)
    .maybeSingle();
  if (!draft) return fail("Draft not found.");
  const res = await writeVersion(supabase, org.id, draft, formData);
  if ("status" in res) return res;
  refresh(org.slug);
  return ok("New version saved. Checks ran.");
}

export async function setDraftScope(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, allowed, supabase } = await ctx(formData, "drafts.write");
  if (!allowed) return fail("Your role can't edit drafts.");
  const draftId = id(formData, "draft_id");
  if (!draftId) return fail("Bad draft id.");
  const { error } = await supabase
    .from("drafts")
    .update({ in_scope: str(formData.get("in_scope")) === "true" })
    .eq("id", draftId)
    .eq("org_id", org.id);
  const f = jobFail(error);
  if (f) return f;
  refresh(org.slug);
  return ok("Saved.");
}

export async function overrideCheck(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, allowed, supabase } = await ctx(formData, "checks.override");
  if (!allowed) return fail("Only an owner or admin can override a check.");
  const resultId = id(formData, "result_id");
  if (!resultId) return fail("Bad result id.");
  const { error } = await supabase.rpc("override_check_result", {
    p_result: resultId,
    p_reason: str(formData.get("reason")),
  });
  const f = jobFail(error);
  if (f) return f;
  refresh(org.slug);
  return ok("Override recorded.");
}

export async function decide(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, allowed, supabase } = await ctx(formData, "drafts.approve");
  if (!allowed) return fail("Your role can't approve.");
  const subjectId = id(formData, "subject_id");
  const subjectType = str(formData.get("subject_type"));
  const decision = str(formData.get("decision"));
  if (!subjectId || !["draft_version", "outbox_message"].includes(subjectType)) return fail("Bad request.");
  // Warnings don't block, but the approver must acknowledge them (BUILD_PLAN §3.5).
  if (decision === "approved" && Number(str(formData.get("warnings")) || 0) > 0 && formData.get("ack") !== "on")
    return fail("Tick the box to confirm you read the warnings.");
  const { error } = await supabase.rpc("approve_subject", {
    p_subject_type: subjectType,
    p_subject_id: subjectId,
    p_decision: decision,
    p_comment: optStr(formData.get("comment")) ?? undefined,
  });
  const f = jobFail(error);
  if (f) return f;
  refresh(org.slug);
  return ok(decision === "approved" ? "Approved." : "Sent back with your note.");
}

// ---------------------------------------------------------------------------
// Outbox and deliverables
// ---------------------------------------------------------------------------
const CHANNELS = ["email", "sms", "gbp_post", "gbp_reply", "listing_push", "manual"] as const;

export async function saveOutbox(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, allowed, supabase } = await ctx(formData, "jobs.write");
  if (!allowed) return fail("Your role can't write outbox items.");
  const channel = z.enum(CHANNELS).safeParse(str(formData.get("channel")));
  const body = str(formData.get("body"));
  if (!channel.success || !body) return fail("Pick a channel and write the message.");
  const fields = {
    channel: channel.data,
    recipient: optStr(formData.get("recipient")),
    subject: optStr(formData.get("subject")),
    body: body.slice(0, 20000),
  };
  const existing = id(formData, "id");
  if (existing) {
    const { error } = await supabase.from("outbox_messages").update(fields).eq("id", existing).eq("org_id", org.id);
    const f = jobFail(error);
    if (f) return f;
  } else {
    const brand = id(formData, "brand_id");
    if (!brand) return fail("Pick a brand.");
    const { error } = await supabase
      .from("outbox_messages")
      .insert({ ...fields, org_id: org.id, brand_id: brand, job_id: id(formData, "job_id") });
    const f = jobFail(error);
    if (f) return f;
  }
  refresh(org.slug);
  return ok(existing ? "Saved. It needs approval again." : "Added. It needs approval before release.");
}

export async function releaseOutbox(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, allowed } = await ctx(formData, "outbox.release");
  if (!allowed) return fail("Your role can't release outbox items.");
  const outboxId = id(formData, "id");
  if (!outboxId) return fail("Bad id.");
  const res = await senderFor().release(outboxId);
  if (!res.ok) return jobFail({ code: res.code, message: res.message }) ?? fail(res.message);
  refresh(org.slug);
  return ok("Marked sent (manual send).");
}

export async function cancelOutbox(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, allowed, supabase } = await ctx(formData, "jobs.write");
  if (!allowed) return fail("Your role can't cancel outbox items.");
  const outboxId = id(formData, "id");
  if (!outboxId) return fail("Bad id.");
  const { error } = await supabase.rpc("cancel_outbox", { p_id: outboxId, p_reason: str(formData.get("reason")) });
  const f = jobFail(error);
  if (f) return f;
  refresh(org.slug);
  return ok("Cancelled.");
}

export async function addDeliverable(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, allowed, supabase } = await ctx(formData, "jobs.write");
  if (!allowed) return fail("Your role can't edit deliverables.");
  const jobId = id(formData, "job_id");
  const kind = str(formData.get("kind"));
  if (!jobId || !kind) return fail("Name the deliverable.");
  const brand = await jobBrand(supabase, jobId);
  if (!brand) return fail("Job not found.");
  const { error } = await supabase
    .from("deliverables")
    .insert({ org_id: org.id, brand_id: brand, job_id: jobId, kind: kind.slice(0, 120) });
  const f = jobFail(error);
  if (f) return f;
  refresh(org.slug);
  return ok("Deliverable added.");
}

// ---------------------------------------------------------------------------
// Settings > Checks: org overrides of the global rules
// ---------------------------------------------------------------------------
export async function saveRuleOverride(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, allowed, supabase } = await ctx(formData, "checks.manage");
  if (!allowed) return fail("Only an owner or admin can change check rules.");
  const ruleKey = str(formData.get("rule_key"));
  const severity = z.enum(["blocker", "warning", "info"]).safeParse(str(formData.get("severity")));
  if (!severity.success) return fail("Pick a severity.");
  const params = parseJson(str(formData.get("params")), {});
  if (params === undefined) return fail("Parameters must be a JSON object.");
  const active = formData.get("active") === "on";
  const { data: base } = await supabase
    .from("check_rules")
    .select("pack, title")
    .is("org_id", null)
    .eq("rule_key", ruleKey)
    .maybeSingle();
  if (!base) return fail("Unknown rule.");
  const { data: mine } = await supabase
    .from("check_rules")
    .select("id")
    .eq("org_id", org.id)
    .eq("rule_key", ruleKey)
    .maybeSingle();
  const { error } = mine
    ? await supabase.from("check_rules").update({ severity: severity.data, params, active }).eq("id", mine.id)
    : await supabase.from("check_rules").insert({
        org_id: org.id,
        rule_key: ruleKey,
        pack: base.pack,
        title: base.title,
        severity: severity.data,
        params,
        active,
      });
  const f = jobFail(error);
  if (f) return f;
  refresh(org.slug);
  return ok("Rule saved for this org. New check runs use it.");
}
