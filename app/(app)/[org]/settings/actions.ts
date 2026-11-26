"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAppUser } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { createSupabaseAdminClient } from "@/server/db/admin-client";
import { getOrgBySlug, hasPerm } from "@/server/permissions";
import { serverEnv } from "@/server/config/env";
import { appAudit } from "@/server/audit";

export type FormState = { status: "idle" | "ok" | "error"; message?: string };

const ROLES = ["owner", "admin", "operator", "reviewer", "viewer"] as const;

function fail(message: string): FormState {
  return { status: "error", message };
}

// Turns database refusals into plain messages without leaking internals.
function dbError(error: { code?: string; message?: string } | null): FormState | null {
  if (!error) return null;
  if (error.code === "42501")
    return fail(error.message?.includes("owner") ? error.message : "Your role isn't allowed to make this change.");
  if (error.code === "23514") return fail(error.message ?? "That change isn't allowed.");
  if (error.code === "23505") return fail("That already exists.");
  console.error("settings action failed", error.code);
  return fail("Something went wrong. Nothing was changed.");
}

// ---------------------------------------------------------------------------
// Org settings
// ---------------------------------------------------------------------------
const orgSchema = z.object({
  org: z.string(),
  name: z.string().trim().min(1).max(120),
  two_person_rule: z.boolean(),
  operator_can_approve: z.boolean(),
  operator_can_release: z.boolean(),
});

export async function saveOrgSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAppUser();
  const parsed = orgSchema.safeParse({
    org: formData.get("org"),
    name: formData.get("name"),
    two_person_rule: formData.get("two_person_rule") === "on",
    operator_can_approve: formData.get("operator_can_approve") === "on",
    operator_can_release: formData.get("operator_can_release") === "on",
  });
  if (!parsed.success) return fail("Check the form and try again.");
  const org = await getOrgBySlug(parsed.data.org);
  if (!(await hasPerm(org.id, "settings.manage"))) return fail("Your role isn't allowed to change org settings.");

  const supabase = await createSupabaseServerClient();
  if (await hasPerm(org.id, "org.manage")) {
    const r = dbError((await supabase.from("orgs").update({ name: parsed.data.name }).eq("id", org.id)).error);
    if (r) return r;
  }
  for (const key of ["two_person_rule", "operator_can_approve", "operator_can_release"] as const) {
    const r = dbError(
      (await supabase.from("settings").update({ value: parsed.data[key] }).eq("org_id", org.id).eq("key", key)).error,
    );
    if (r) return r;
  }
  revalidatePath(`/${org.slug}`, "layout");
  return { status: "ok", message: "Saved." };
}

// ---------------------------------------------------------------------------
// Brands
// ---------------------------------------------------------------------------
const brandSchema = z.object({
  org: z.string(),
  id: z.uuid(),
  name: z.string().trim().min(1).max(120),
  from_email: z.union([z.literal(""), z.email().max(254)]),
  legal_footer: z.string().trim().max(500),
});

export async function saveBrand(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAppUser();
  const parsed = brandSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  const org = await getOrgBySlug(parsed.data.org);
  if (!(await hasPerm(org.id, "settings.manage"))) return fail("Your role isn't allowed to edit brands.");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("brands")
    .update({
      name: parsed.data.name,
      from_email: parsed.data.from_email || null,
      legal_footer: parsed.data.legal_footer || null,
    })
    .eq("id", parsed.data.id)
    .eq("org_id", org.id)
    .select("id");
  const r = dbError(error);
  if (r) return r;
  if (!data?.length) return fail("Brand not found.");
  revalidatePath(`/${org.slug}`, "layout");
  return { status: "ok", message: "Brand saved." };
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------
const inviteSchema = z.object({
  org: z.string(),
  email: z.email().max(254),
  role: z.enum(ROLES),
  brand_ids: z.array(z.uuid()),
});

export async function inviteMember(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAppUser();
  const parsed = inviteSchema.safeParse({
    org: formData.get("org"),
    email: String(formData.get("email") ?? "")
      .trim()
      .toLowerCase(),
    role: formData.get("role"),
    brand_ids: formData.getAll("brand_ids").map(String),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  const org = await getOrgBySlug(parsed.data.org);

  // Permission first, as the signed-in user. Only then use the service role,
  // and only to create/look up the auth user and send the invitation email.
  if (!(await hasPerm(org.id, "members.manage"))) return fail("Your role isn't allowed to invite members.");
  if (parsed.data.role === "owner" && !(await hasPerm(org.id, "org.manage")))
    return fail("Only an owner can invite an owner.");

  // Brand scope, as the signed-in user, before any email or account is created.
  // The memberships policy enforces the same rule, but checking first means a
  // refused invite never sends mail or leaves a half-created account.
  const brandIds = parsed.data.brand_ids.length ? parsed.data.brand_ids : null;
  const scope = await (
    await createSupabaseServerClient()
  ).rpc("brand_ids_within_caller", {
    p_org: org.id,
    p_brand_ids: brandIds as string[],
  });
  if (scope.error || scope.data !== true)
    return fail("You can only invite people to brands you have access to. Pick at least one brand.");

  const admin = createSupabaseAdminClient();
  let userId: string | null = null;
  const invite = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
    redirectTo: `${serverEnv().APP_BASE_URL}/auth/confirm`,
  });
  if (invite.data.user) {
    userId = invite.data.user.id;
  } else {
    // Already has an account: find it (small user base; paginate defensively).
    for (let page = 1; page <= 20 && !userId; page++) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      userId = data.users.find((u) => u.email?.toLowerCase() === parsed.data.email)?.id ?? null;
      if (data.users.length < 200) break;
    }
  }
  if (!userId) return fail("Could not create the invitation. Check the address and try again.");

  // The membership row is written as the signed-in user, so RLS and the owner guard apply.
  const supabase = await createSupabaseServerClient();
  const r = dbError(
    (
      await supabase.from("memberships").insert({
        org_id: org.id,
        user_id: userId,
        role: parsed.data.role,
        brand_ids: brandIds,
        status: "invited",
      })
    ).error,
  );
  if (r) return r;
  await appAudit({
    orgId: org.id,
    action: "app.member.invited",
    subjectType: "memberships",
    subjectId: userId,
    after: { role: parsed.data.role },
  });
  revalidatePath(`/${org.slug}/settings/members`);
  return {
    status: "ok",
    message: `Invited ${parsed.data.email}. In development the email lands in the local mail catcher.`,
  };
}

const updateMemberSchema = z.object({
  org: z.string(),
  id: z.uuid(),
  role: z.enum([...ROLES, "client"]),
  status: z.enum(["active", "invited", "disabled"]),
});

export async function updateMember(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAppUser();
  const parsed = updateMemberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Check the form and try again.");
  const org = await getOrgBySlug(parsed.data.org);
  if (!(await hasPerm(org.id, "members.manage"))) return fail("Your role isn't allowed to change members.");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("memberships")
    .update({ role: parsed.data.role, status: parsed.data.status })
    .eq("id", parsed.data.id)
    .eq("org_id", org.id)
    .select("id");
  const r = dbError(error);
  if (r) return r;
  if (!data?.length) return fail("Member not found.");
  revalidatePath(`/${org.slug}/settings/members`);
  return { status: "ok", message: "Member updated." };
}
