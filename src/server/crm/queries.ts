import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { ALL_BRANDS } from "@/lib/brand-selection";

// All reads run as the signed-in user, so RLS decides what comes back.

export const getOrgPeople = cache(async (orgId: string) => {
  const supabase = await createSupabaseServerClient();
  const [{ data: members }, { data: profiles }] = await Promise.all([
    supabase
      .from("memberships")
      .select("user_id, role, status")
      .eq("org_id", orgId)
      .eq("status", "active")
      .neq("role", "client"),
    supabase.from("profiles").select("user_id, display_name"),
  ]);
  return (members ?? []).map((m) => ({
    id: m.user_id,
    role: m.role,
    name: profiles?.find((p) => p.user_id === m.user_id)?.display_name ?? "Unknown",
  }));
});

export async function listCompanies(orgId: string, activeBrand: string | null) {
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("companies")
    .select("id, name, website, city, state, lifecycle, brand_ids, created_at")
    .eq("org_id", orgId)
    .order("name")
    .limit(500);
  if (activeBrand && activeBrand !== ALL_BRANDS) q = q.or(`brand_ids.is.null,brand_ids.cs.{${activeBrand}}`);
  return (await q).data ?? [];
}

export async function getCompany(orgId: string, id: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("companies").select("*").eq("org_id", orgId).eq("id", id).maybeSingle();
  return data;
}

export async function listContacts(orgId: string, companyId?: string) {
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("contacts")
    .select("id, first_name, last_name, email, phone_e164, title, company_id, do_not_contact, companies(name)")
    .eq("org_id", orgId)
    .order("last_name", { nullsFirst: false })
    .limit(1000);
  if (companyId) q = q.eq("company_id", companyId);
  return (await q).data ?? [];
}

export async function getContact(orgId: string, id: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("contacts")
    .select("*, companies(id, name)")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  return data;
}

export async function listPipelines(orgId: string, activeBrand: string | null) {
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("pipelines")
    .select("id, name, brand_id, brands(name, key), pipeline_stages(id, name, position, outcome)")
    .eq("org_id", orgId)
    .order("created_at");
  if (activeBrand && activeBrand !== ALL_BRANDS) q = q.eq("brand_id", activeBrand);
  const { data } = await q;
  return (data ?? []).map((p) => ({
    ...p,
    pipeline_stages: [...(p.pipeline_stages ?? [])].sort((a, b) => a.position - b.position),
  }));
}

export async function listDeals(orgId: string, filter: { activeBrand?: string | null; companyId?: string } = {}) {
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("deals")
    .select(
      "id, title, value_cents, offer, status, stage_id, pipeline_id, brand_id, company_id, updated_at, companies(name)",
    )
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(1000);
  if (filter.activeBrand && filter.activeBrand !== ALL_BRANDS) q = q.eq("brand_id", filter.activeBrand);
  if (filter.companyId) q = q.eq("company_id", filter.companyId);
  return (await q).data ?? [];
}

export async function listTasks(
  orgId: string,
  filter: {
    assignee?: string;
    subjectType?: string;
    subjectId?: string;
    status?: "open" | "done";
    activeBrand?: string | null;
  } = {},
) {
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("tasks")
    .select(
      "id, title, body, assignee_user_id, due_at, status, priority, subject_type, subject_id, brand_id, recurring_rule",
    )
    .eq("org_id", orgId)
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(500);
  if (filter.assignee) q = q.eq("assignee_user_id", filter.assignee);
  if (filter.subjectType && filter.subjectId)
    q = q.eq("subject_type", filter.subjectType).eq("subject_id", filter.subjectId);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.activeBrand && filter.activeBrand !== ALL_BRANDS)
    q = q.or(`brand_id.is.null,brand_id.eq.${filter.activeBrand}`);
  return (await q).data ?? [];
}

export async function listActivities(orgId: string, subjectType: string, subjectIds: string[]) {
  if (subjectIds.length === 0) return [];
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("activities")
    .select("id, kind, body, occurred_at, created_by, subject_type, subject_id")
    .eq("org_id", orgId)
    .eq("subject_type", subjectType)
    .in("subject_id", subjectIds)
    .order("occurred_at", { ascending: false })
    .limit(200);
  return data ?? [];
}

export async function listComments(orgId: string, subjectType: string, subjectId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("comments")
    .select("id, body_md, mentions, created_by, created_at, updated_at, resolved_at")
    .eq("org_id", orgId)
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .order("created_at");
  return data ?? [];
}

export async function listNotifications(orgId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, kind, subject_type, subject_id, payload, read_at, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(100);
  return data ?? [];
}

export async function unreadCount(orgId: string) {
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .is("read_at", null);
  return count ?? 0;
}
