"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAppUser } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { getOrgBySlug, getVisibleBrands, hasPerm } from "@/server/permissions";
import { dbFail, fail, ok, str, type ActionState } from "@/server/crm/action-utils";

async function settingsCtx(formData: FormData) {
  await requireAppUser();
  const org = await getOrgBySlug(str(formData.get("org")));
  return { org, allowed: await hasPerm(org.id, "settings.manage"), supabase: await createSupabaseServerClient() };
}

// ---------------------------------------------------------------------------
// Lead forms
// ---------------------------------------------------------------------------
const formSchema = z
  .object({
    name: z.string().min(1).max(200),
    brand_id: z.uuid(),
    consent_text: z.string().max(2000),
    consent_text_version: z.string().max(60),
    redirect_url: z.union([z.literal(""), z.url().startsWith("https://").max(500)]),
  })
  .refine((f) => !f.consent_text || f.consent_text_version, {
    message: "Give the consent text a version (for example fpd-2026-11-v2).",
  });

export async function saveForm(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, allowed, supabase } = await settingsCtx(formData);
  if (!allowed) return fail("Your role can't manage forms.");
  const parsed = formSchema.safeParse({
    name: str(formData.get("name")),
    brand_id: str(formData.get("brand_id")),
    consent_text: str(formData.get("consent_text")),
    consent_text_version: str(formData.get("consent_text_version")),
    redirect_url: str(formData.get("redirect_url")),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  if (!(await getVisibleBrands(org.id)).some((b) => b.id === parsed.data.brand_id)) return fail("Pick a brand.");
  const d = parsed.data;
  const res = await supabase
    .from("forms")
    .insert({
      org_id: org.id,
      brand_id: d.brand_id,
      name: d.name,
      consent_text: d.consent_text || null,
      consent_text_version: d.consent_text_version || null,
      redirect_url: d.redirect_url || null,
    })
    .select("id")
    .single();
  const err = dbFail(res.error);
  if (err) return err;
  revalidatePath(`/${org.slug}/settings/forms`);
  return ok("Form created.", res.data?.id);
}

export async function setFormActive(formData: FormData): Promise<void> {
  const { org, allowed, supabase } = await settingsCtx(formData);
  const id = str(formData.get("id"));
  if (!allowed || !z.uuid().safeParse(id).success) return;
  await supabase
    .from("forms")
    .update({ active: formData.get("active") === "true" })
    .eq("id", id)
    .eq("org_id", org.id);
  revalidatePath(`/${org.slug}/settings/forms`);
}

// ---------------------------------------------------------------------------
// Import guard signatures
// ---------------------------------------------------------------------------
export async function saveSignature(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, allowed, supabase } = await settingsCtx(formData);
  if (!allowed) return fail("Your role can't manage the import guard.");
  const headers = str(formData.get("headers"))
    .split(/[\n,\t]/)
    .map((h) => h.trim())
    .filter(Boolean);
  const parsed = z
    .object({
      label: z.string().min(1).max(200),
      headers: z.array(z.string().max(200)).min(2, "Enter at least two column headers.").max(500),
      threshold: z.coerce.number().min(0.5).max(1),
    })
    .safeParse({
      label: str(formData.get("label")),
      headers: [...new Set(headers)],
      threshold: str(formData.get("threshold")) || "0.8",
    });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  const err = dbFail(
    (
      await supabase.from("import_guard_signatures").insert({
        org_id: org.id,
        label: parsed.data.label,
        header_signature: parsed.data.headers,
        threshold: parsed.data.threshold,
      })
    ).error,
  );
  if (err) return err;
  revalidatePath(`/${org.slug}/settings/import-guard`);
  return ok("Signature saved. Matching uploads will be blocked.");
}

export async function deleteSignature(formData: FormData): Promise<void> {
  const { org, allowed, supabase } = await settingsCtx(formData);
  const id = str(formData.get("id"));
  if (!allowed || !z.uuid().safeParse(id).success) return;
  await supabase.from("import_guard_signatures").delete().eq("id", id).eq("org_id", org.id);
  revalidatePath(`/${org.slug}/settings/import-guard`);
}
