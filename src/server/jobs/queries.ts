import "server-only";
import { createSupabaseServerClient } from "@/server/db/server-client";
import type { GateInfo } from "@/components/jobs/stage-gate-bar";

// All reads go through the user's own client, so RLS decides what is visible.

export async function listClientAccounts(orgId: string, activeBrand: string | null) {
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("client_accounts")
    .select(
      "id, brand_id, status, data_sensitivity, ai_policy, company_id, companies(name), brands(name), contacts(first_name, last_name)",
    )
    .eq("org_id", orgId)
    .order("created_at");
  if (activeBrand) q = q.eq("brand_id", activeBrand);
  const { data } = await q;
  return data ?? [];
}

export async function listJobs(orgId: string, activeBrand: string | null) {
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("jobs")
    .select(
      "id, title, offer, stage, brand_id, due_at, assignee_user_id, reviewer_user_id, brands(name), client_accounts(companies(name))",
    )
    .eq("org_id", orgId)
    .order("due_at", { ascending: true, nullsFirst: false });
  if (activeBrand) q = q.eq("brand_id", activeBrand);
  const { data } = await q;
  return data ?? [];
}

export async function getJob(orgId: string, jobId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("jobs")
    .select("*, brands(name), client_accounts(id, data_sensitivity, ai_policy, companies(id, name))")
    .eq("org_id", orgId)
    .eq("id", jobId)
    .maybeSingle();
  return data;
}

export async function getGates(jobId: string): Promise<GateInfo | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("job_gates", { p_job: jobId });
  if (error) return null;
  return data as unknown as GateInfo;
}

export async function getJobDetail(jobId: string) {
  const supabase = await createSupabaseServerClient();
  const [items, intake, delivery, audits, drafts, outbox, deliverables, stageEvents, events] = await Promise.all([
    supabase.from("job_items").select("*").eq("job_id", jobId).order("created_at"),
    supabase.from("intake_checklists").select("items").eq("job_id", jobId).maybeSingle(),
    supabase.from("delivery_checklists").select("items").eq("job_id", jobId).maybeSingle(),
    supabase
      .from("audits")
      .select("*, audit_findings(*)")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false }),
    supabase
      .from("drafts")
      .select(
        "id, kind, title, status, in_scope, job_item_id, current_version_id, created_at, draft_versions!draft_versions_draft_id_fkey(id, version, author_id, author_kind, created_at)",
      )
      .eq("job_id", jobId)
      .order("created_at"),
    supabase.from("outbox_messages").select("*").eq("job_id", jobId).order("created_at"),
    supabase.from("deliverables").select("*").eq("job_id", jobId).order("created_at"),
    supabase.from("job_stage_events").select("*").eq("job_id", jobId).order("at", { ascending: false }),
    supabase
      .from("events")
      .select("id, type, subject_type, payload, actor_id, at")
      .eq("subject_id", jobId)
      .order("at", { ascending: false })
      .limit(50),
  ]);
  return {
    items: items.data ?? [],
    intake: (intake.data?.items ?? []) as ChecklistItem[],
    delivery: (delivery.data?.items ?? []) as ChecklistItem[],
    audits: audits.data ?? [],
    drafts: drafts.data ?? [],
    outbox: outbox.data ?? [],
    deliverables: deliverables.data ?? [],
    stageEvents: stageEvents.data ?? [],
    events: events.data ?? [],
  };
}

export type ChecklistItem = {
  key: string;
  label: string;
  done: boolean;
  done_by: string | null;
  done_at: string | null;
  evidence: string | null;
};

export async function getDraft(jobId: string, draftId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: draft } = await supabase
    .from("drafts")
    .select("*, job_items(id, title, marketplace, source_data)")
    .eq("job_id", jobId)
    .eq("id", draftId)
    .maybeSingle();
  if (!draft) return null;
  const { data: versions } = await supabase
    .from("draft_versions")
    .select("id, version, content, content_hash, author_id, author_kind, created_at")
    .eq("draft_id", draftId)
    .order("version", { ascending: false });
  const versionIds = (versions ?? []).map((v) => v.id);
  const [{ data: runs }, { data: approvals }] = await Promise.all([
    supabase
      .from("check_runs")
      .select("id, draft_version_id, rules_version, passed, blocker_count, warning_count, created_at, check_results(*)")
      .in("draft_version_id", versionIds.length ? versionIds : ["00000000-0000-0000-0000-000000000000"])
      .order("created_at", { ascending: false }),
    supabase
      .from("approvals")
      .select("*")
      .eq("subject_type", "draft_version")
      .in("subject_id", versionIds.length ? versionIds : ["00000000-0000-0000-0000-000000000000"])
      .order("decided_at", { ascending: false }),
  ]);
  return { draft, versions: versions ?? [], runs: runs ?? [], approvals: approvals ?? [] };
}

/** Drafts waiting for a decision on jobs in review, plus outbox items waiting for approval. */
export async function reviewQueue(orgId: string, activeBrand: string | null) {
  const supabase = await createSupabaseServerClient();
  let dq = supabase
    .from("drafts")
    .select(
      "id, kind, title, status, job_id, current_version_id, brand_id, jobs!inner(title, stage), draft_versions!drafts_current_version_fk(author_id, version)",
    )
    .eq("org_id", orgId)
    .eq("status", "ready_for_review")
    .eq("in_scope", true)
    .eq("jobs.stage", "review");
  if (activeBrand) dq = dq.eq("brand_id", activeBrand);
  let oq = supabase
    .from("outbox_messages")
    .select("*, jobs(title)")
    .eq("org_id", orgId)
    .eq("status", "pending_approval")
    .order("created_at");
  if (activeBrand) oq = oq.eq("brand_id", activeBrand);
  const [{ data: drafts }, { data: outbox }] = await Promise.all([dq, oq]);
  return { drafts: drafts ?? [], outbox: outbox ?? [] };
}

export async function listOutbox(orgId: string, activeBrand: string | null, status: string | null) {
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("outbox_messages")
    .select("*, jobs(title), brands(name)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  if (activeBrand) q = q.eq("brand_id", activeBrand);
  if (status) q = q.eq("status", status);
  const { data } = await q.limit(200);
  return data ?? [];
}

export async function listCheckRules(orgId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("check_rules")
    .select("id, org_id, rule_key, pack, title, severity, params, version, active, updated_at")
    .or(`org_id.is.null,org_id.eq.${orgId}`)
    .order("pack")
    .order("rule_key");
  return data ?? [];
}
