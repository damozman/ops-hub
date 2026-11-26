"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAppUser } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { getOrgBySlug, getVisibleBrands, hasPerm } from "@/server/permissions";
import { getOrgPeople } from "@/server/crm/queries";
import { dbFail, fail, ok, optStr, str, type ActionState } from "@/server/crm/action-utils";
import { extractMentions } from "@/lib/mentions";
import { normalizePhone } from "@/lib/csv";

// Every action: signed-in + MFA, org membership (404 otherwise), permission check
// here, and the same check again in RLS. Database triggers write audit_log and events.

async function ctx(formData: FormData, perm: "crm.write" | "crm.read" = "crm.write") {
  const session = await requireAppUser();
  const org = await getOrgBySlug(str(formData.get("org")));
  const allowed = await hasPerm(org.id, perm);
  return { session, org, allowed, supabase: await createSupabaseServerClient() };
}

const uuid = z.uuid();

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------
const companySchema = z.object({
  name: z.string().min(1).max(200),
  website: z.union([z.literal(""), z.url().max(300)]),
  industry: z.string().max(120),
  street_address: z.string().max(300),
  city: z.string().max(120),
  state: z.string().max(60),
  lifecycle: z.enum(["lead", "prospect", "client", "churned"]),
});

export async function saveCompany(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, allowed, supabase } = await ctx(formData);
  if (!allowed) return fail("Your role can't edit companies.");
  const parsed = companySchema.safeParse({
    name: str(formData.get("name")),
    website: str(formData.get("website")),
    industry: str(formData.get("industry")),
    street_address: str(formData.get("street_address")),
    city: str(formData.get("city")),
    state: str(formData.get("state")),
    lifecycle: str(formData.get("lifecycle")) || "lead",
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  const visible = (await getVisibleBrands(org.id)).map((b) => b.id);
  const brandIds = formData
    .getAll("brand_ids")
    .map(String)
    .filter((b) => visible.includes(b));
  const row = {
    ...parsed.data,
    website: parsed.data.website || null,
    industry: parsed.data.industry || null,
    street_address: parsed.data.street_address || null,
    city: parsed.data.city || null,
    state: parsed.data.state || null,
    sells_online: formData.get("sells_online") === "on",
    brand_ids: brandIds.length ? brandIds : null,
  };
  const id = optStr(formData.get("id"));
  if (id && !uuid.safeParse(id).success) return fail("Bad company id.");
  const res = id
    ? await supabase.from("companies").update(row).eq("id", id).eq("org_id", org.id).select("id").single()
    : await supabase
        .from("companies")
        .insert({ ...row, org_id: org.id, source: "manual" })
        .select("id")
        .single();
  const err = dbFail(res.error);
  if (err) return err;
  revalidatePath(`/${org.slug}/crm`, "layout");
  return ok(id ? "Company saved." : "Company created.", res.data?.id);
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------
const contactSchema = z.object({
  first_name: z.string().max(100),
  last_name: z.string().max(100),
  email: z.union([z.literal(""), z.email().max(254)]),
  phone: z.string().max(40),
  title: z.string().max(120),
});

export async function saveContact(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, allowed, supabase } = await ctx(formData);
  if (!allowed) return fail("Your role can't edit contacts.");
  const parsed = contactSchema.safeParse({
    first_name: str(formData.get("first_name")),
    last_name: str(formData.get("last_name")),
    email: str(formData.get("email")).toLowerCase(),
    phone: str(formData.get("phone")),
    title: str(formData.get("title")),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  const phone = parsed.data.phone ? normalizePhone(parsed.data.phone) : null;
  if (parsed.data.phone && !phone) return fail("Enter the phone as 10 digits or +country format.");
  const companyId = optStr(formData.get("company_id"));
  if (companyId && !uuid.safeParse(companyId).success) return fail("Bad company.");
  const row = {
    first_name: parsed.data.first_name || null,
    last_name: parsed.data.last_name || null,
    email: parsed.data.email || null,
    phone_e164: phone,
    title: parsed.data.title || null,
    company_id: companyId,
    do_not_contact: formData.get("do_not_contact") === "on",
  };
  if (!row.first_name && !row.last_name && !row.email && !row.phone_e164)
    return fail("Give at least a name, email or phone.");
  const id = optStr(formData.get("id"));
  const res = id
    ? await supabase.from("contacts").update(row).eq("id", id).eq("org_id", org.id).select("id").single()
    : await supabase
        .from("contacts")
        .insert({ ...row, org_id: org.id })
        .select("id")
        .single();
  const err = dbFail(res.error);
  if (err) return err;
  revalidatePath(`/${org.slug}/crm`, "layout");
  return ok(id ? "Contact saved." : "Contact created.", res.data?.id);
}

// ---------------------------------------------------------------------------
// Deals
// ---------------------------------------------------------------------------
export async function createDeal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, allowed, supabase } = await ctx(formData);
  if (!allowed) return fail("Your role can't create deals.");
  const parsed = z
    .object({
      title: z.string().min(1).max(200),
      stage_id: uuid,
      company_id: z.union([z.literal(""), uuid]),
      value: z.coerce.number().min(0).max(100_000_000),
      offer: z.enum(["A", "B", "other"]),
    })
    .safeParse({
      title: str(formData.get("title")),
      stage_id: str(formData.get("stage_id")),
      company_id: str(formData.get("company_id")),
      value: str(formData.get("value")) || "0",
      offer: str(formData.get("offer")) || "other",
    });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  // The stage decides the pipeline and brand (RLS only returns stages the user can see).
  const { data: stage } = await supabase
    .from("pipeline_stages")
    .select("pipeline_id, pipelines(brand_id)")
    .eq("id", parsed.data.stage_id)
    .eq("org_id", org.id)
    .maybeSingle();
  if (!stage?.pipelines) return fail("Pick a stage.");
  const res = await supabase
    .from("deals")
    .insert({
      org_id: org.id,
      brand_id: stage.pipelines.brand_id,
      pipeline_id: stage.pipeline_id,
      stage_id: parsed.data.stage_id,
      title: parsed.data.title,
      company_id: parsed.data.company_id || null,
      value_cents: Math.round(parsed.data.value * 100),
      offer: parsed.data.offer,
    })
    .select("id")
    .single();
  const err = dbFail(res.error);
  if (err) return err;
  revalidatePath(`/${org.slug}/crm`, "layout");
  return ok("Deal created.", res.data?.id);
}

/** Kanban move. The database writes the activity, event and audit rows. */
export async function moveDeal(orgSlug: string, dealId: string, stageId: string): Promise<ActionState> {
  await requireAppUser();
  if (!uuid.safeParse(dealId).success || !uuid.safeParse(stageId).success) return fail("Bad request.");
  const org = await getOrgBySlug(orgSlug);
  if (!(await hasPerm(org.id, "crm.write"))) return fail("Your role can't move deals.");
  const supabase = await createSupabaseServerClient();
  const res = await supabase
    .from("deals")
    .update({ stage_id: stageId })
    .eq("id", dealId)
    .eq("org_id", org.id)
    .select("id");
  const err = dbFail(res.error);
  if (err) return err;
  if (!res.data?.length) return fail("Deal not found.");
  revalidatePath(`/${org.slug}/crm/deals`);
  return ok("Moved.");
}

// ---------------------------------------------------------------------------
// Activities (notes / calls / meetings)
// ---------------------------------------------------------------------------
export async function addActivity(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, allowed, supabase } = await ctx(formData);
  if (!allowed) return fail("Your role can't add notes.");
  const parsed = z
    .object({
      subject_type: z.enum(["company", "contact", "deal"]),
      subject_id: uuid,
      kind: z.enum(["note", "call", "email_logged", "meeting"]),
      body: z.string().min(1).max(5000),
    })
    .safeParse({
      subject_type: str(formData.get("subject_type")),
      subject_id: str(formData.get("subject_id")),
      kind: str(formData.get("kind")) || "note",
      body: str(formData.get("body")),
    });
  if (!parsed.success) return fail("Write something first.");
  const err = dbFail((await supabase.from("activities").insert({ ...parsed.data, org_id: org.id })).error);
  if (err) return err;
  revalidatePath(`/${org.slug}/crm`, "layout");
  return ok("Logged.");
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
export async function createTask(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, allowed, supabase } = await ctx(formData);
  if (!allowed) return fail("Your role can't create tasks.");
  const people = await getOrgPeople(org.id);
  const parsed = z
    .object({
      title: z.string().min(1).max(200),
      body: z.string().max(5000),
      assignee: z.union([z.literal(""), uuid]),
      due: z.union([z.literal(""), z.iso.date()]),
      priority: z.enum(["low", "normal", "high"]),
      recurring_rule: z.union([z.literal(""), z.enum(["RRULE:FREQ=WEEKLY", "RRULE:FREQ=MONTHLY"])]),
      subject_type: z.union([z.literal(""), z.enum(["company", "contact", "deal"])]),
      subject_id: z.union([z.literal(""), uuid]),
    })
    .safeParse({
      title: str(formData.get("title")),
      body: str(formData.get("body")),
      assignee: str(formData.get("assignee")),
      due: str(formData.get("due")),
      priority: str(formData.get("priority")) || "normal",
      recurring_rule: str(formData.get("recurring_rule")),
      subject_type: str(formData.get("subject_type")),
      subject_id: str(formData.get("subject_id")),
    });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  const d = parsed.data;
  if (d.assignee && !people.some((p) => p.id === d.assignee)) return fail("Pick someone in this workspace.");
  const err = dbFail(
    (
      await supabase.from("tasks").insert({
        org_id: org.id,
        title: d.title,
        body: d.body || null,
        assignee_user_id: d.assignee || null,
        due_at: d.due ? new Date(`${d.due}T17:00:00-06:00`).toISOString() : null,
        priority: d.priority,
        recurring_rule: d.recurring_rule || null,
        subject_type: d.subject_type || null,
        subject_id: d.subject_id || null,
      })
    ).error,
  );
  if (err) return err;
  revalidatePath(`/${org.slug}`, "layout");
  return ok("Task added.");
}

export async function setTaskStatus(formData: FormData): Promise<void> {
  const { org, allowed, supabase } = await ctx(formData);
  const id = str(formData.get("id"));
  const status = str(formData.get("status"));
  if (!allowed || !uuid.safeParse(id).success || !["open", "done", "cancelled"].includes(status)) return;
  await supabase
    .from("tasks")
    .update({ status: status as "open" | "done" | "cancelled" })
    .eq("id", id)
    .eq("org_id", org.id);
  revalidatePath(`/${org.slug}`, "layout");
}

// ---------------------------------------------------------------------------
// Comments with @mentions
// ---------------------------------------------------------------------------
export async function addComment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session, org, allowed, supabase } = await ctx(formData);
  if (!allowed) return fail("Your role can't comment.");
  const parsed = z
    .object({
      subject_type: z.enum(["company", "contact", "deal", "task"]),
      subject_id: uuid,
      body: z.string().min(1).max(10000),
    })
    .safeParse({
      subject_type: str(formData.get("subject_type")),
      subject_id: str(formData.get("subject_id")),
      body: str(formData.get("body")),
    });
  if (!parsed.success) return fail("Write a comment first.");
  const people = await getOrgPeople(org.id);
  const mentions = extractMentions(parsed.data.body, people).filter((id) => id !== session.userId);
  const err = dbFail(
    (
      await supabase.from("comments").insert({
        org_id: org.id,
        subject_type: parsed.data.subject_type,
        subject_id: parsed.data.subject_id,
        body_md: parsed.data.body,
        mentions,
        created_by: session.userId,
      })
    ).error,
  );
  if (err) return err;
  revalidatePath(`/${org.slug}`, "layout");
  const names = people.filter((p) => mentions.includes(p.id)).map((p) => p.name);
  return ok(names.length ? `Posted. Notified ${names.join(", ")}.` : "Posted.");
}

export async function editComment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session, org, allowed, supabase } = await ctx(formData);
  if (!allowed) return fail("Your role can't edit comments.");
  const id = str(formData.get("id"));
  const body = str(formData.get("body"));
  if (!uuid.safeParse(id).success || !body) return fail("Write a comment first.");
  const people = await getOrgPeople(org.id);
  const mentions = extractMentions(body, people).filter((p) => p !== session.userId);
  const res = await supabase
    .from("comments")
    .update({ body_md: body, mentions })
    .eq("id", id)
    .eq("org_id", org.id)
    .select("id");
  const err = dbFail(res.error);
  if (err) return err;
  revalidatePath(`/${org.slug}`, "layout");
  return ok("Comment updated.");
}

// ---------------------------------------------------------------------------
// Bookings: store a link only (Cal.com is never called or configured; D4)
// ---------------------------------------------------------------------------
export async function addBookingLink(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, allowed, supabase } = await ctx(formData);
  if (!allowed) return fail("Your role can't add bookings.");
  const parsed = z
    .object({
      contact_id: uuid,
      booking_url: z.url().startsWith("https://").max(500),
      starts_at: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)]),
      notes: z.string().max(1000),
    })
    .safeParse({
      contact_id: str(formData.get("contact_id")),
      booking_url: str(formData.get("booking_url")),
      starts_at: str(formData.get("starts_at")),
      notes: str(formData.get("notes")),
    });
  if (!parsed.success) return fail("Paste the https:// booking link.");
  const err = dbFail(
    (
      await supabase.from("bookings").insert({
        org_id: org.id,
        contact_id: parsed.data.contact_id,
        source: "link",
        booking_url: parsed.data.booking_url,
        starts_at: parsed.data.starts_at ? new Date(`${parsed.data.starts_at}:00-06:00`).toISOString() : null,
        notes: parsed.data.notes || null,
      })
    ).error,
  );
  if (err) return err;
  revalidatePath(`/${org.slug}/crm`, "layout");
  return ok("Booking saved.");
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
export async function markNotificationsRead(formData: FormData): Promise<void> {
  const { org, supabase } = await ctx(formData, "crm.read");
  const id = optStr(formData.get("id"));
  let q = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("org_id", org.id)
    .is("read_at", null);
  if (id && uuid.safeParse(id).success) q = q.eq("id", id);
  await q;
  revalidatePath(`/${org.slug}`, "layout");
}
