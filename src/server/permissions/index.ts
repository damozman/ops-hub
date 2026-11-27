import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/server/db/server-client";

export const PERMISSIONS = [
  "org.manage",
  "members.manage",
  "crm.read",
  "crm.write",
  "jobs.read",
  "jobs.write",
  "jobs.transition",
  "drafts.write",
  "drafts.approve",
  "outbox.release",
  "checks.manage",
  "checks.override",
  "audit.read",
  "settings.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Same check as RLS (public.has_perm). Server code checks, and the database checks again. */
export async function hasPerm(orgId: string, perm: Permission): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("has_perm", { p_org: orgId, p_perm: perm });
  if (error) return false;
  return data === true;
}

export const getMyOrgs = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("orgs").select("id, name, slug").order("name");
  return data ?? [];
});

/** Loads an org the user is an internal member of, or 404s (no hint that it exists). */
export const getOrgBySlug = cache(async (slug: string) => {
  const supabase = await createSupabaseServerClient();
  const { data: org } = await supabase.from("orgs").select("id, name, slug").eq("slug", slug).maybeSingle();
  if (!org) notFound();
  const { data: role } = await supabase.rpc("auth_role", { p_org: org.id });
  return { ...org, role: (role as string | null) ?? null };
});

export const getVisibleBrands = cache(async (orgId: string) => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("brands")
    .select("id, key, name, from_email, legal_footer")
    .eq("org_id", orgId)
    .order("key");
  return data ?? [];
});
