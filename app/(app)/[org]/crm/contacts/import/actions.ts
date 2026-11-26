"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAppUser } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { createSupabaseAdminClient } from "@/server/db/admin-client";
import { getOrgBySlug, getVisibleBrands, hasPerm } from "@/server/permissions";
import { appAudit } from "@/server/audit";
import { CONTACT_FIELDS, guessMapping, parseCsv, type ContactField } from "@/lib/csv";
import { mapRows } from "@/lib/contact-import";

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 5000; // same cap as public.import_contacts

export type PreviewState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "blocked"; message: string }
  | {
      status: "preview";
      fileId: string;
      headers: string[];
      mapping: Record<string, ContactField | "">;
      sample: string[][];
      rowCount: number;
    };

export type ImportState = { status: "idle" | "ok" | "error"; message?: string };

async function importCtx(orgSlug: string) {
  const session = await requireAppUser();
  const org = await getOrgBySlug(orgSlug);
  return {
    session,
    org,
    allowed: await hasPerm(org.id, "crm.write"),
    supabase: await createSupabaseServerClient(),
  };
}

/** True when the headers match an import-guard template (checked in the database as the user). */
async function guardMatch(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  orgId: string,
  headers: string[],
) {
  const { data, error } = await supabase.rpc("import_guard_match", { p_org: orgId, p_headers: headers });
  if (error) throw new Error(`import guard check failed (${error.code})`);
  return (data as string | null) ?? null;
}

/**
 * Step 1: check the header row against the import guard BEFORE storing anything.
 * A match is refused and logged; the file is never stored. Otherwise the file is
 * stored privately under the org's folder and a preview is returned.
 */
export async function previewImport(_prev: PreviewState, formData: FormData): Promise<PreviewState> {
  const { session, org, allowed, supabase } = await importCtx(String(formData.get("org") ?? ""));
  if (!allowed) return { status: "error", message: "Your role can't import contacts." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { status: "error", message: "Choose a CSV file." };
  if (file.size > MAX_BYTES) return { status: "error", message: "CSV files are limited to 2 MB." };
  if (!/\.csv$/i.test(file.name)) return { status: "error", message: "Only .csv files can be imported." };

  const bytes = Buffer.from(await file.arrayBuffer());
  let rows: string[][];
  try {
    rows = parseCsv(bytes.toString("utf8"), 200_000); // 2 MB cap bounds this; the row cap is checked below
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Could not read the CSV." };
  }
  if (rows.length < 2) return { status: "error", message: "The CSV needs a header row and at least one data row." };
  if (rows.length - 1 > MAX_ROWS) return { status: "error", message: "Imports are limited to 5,000 rows per file." };
  const headers = rows[0].map((h) => h.trim());

  const matched = await guardMatch(supabase, org.id, headers);
  if (matched) {
    // Log the refusal without the file contents.
    await appAudit({
      orgId: org.id,
      action: "app.import.blocked",
      subjectType: "import",
      subjectId: null,
      after: {
        template: matched,
        file_name: file.name.slice(0, 200),
        header_count: headers.length,
        by: session.userId,
      },
    });
    return {
      status: "blocked",
      message: `Blocked: this file matches the protected template "${matched}". Client catalog files can't be imported into Ops Hub. The attempt was logged.`,
    };
  }

  // Users can't write to storage or files directly (RLS); the server stores the file
  // with the service role, only after the permission and import-guard checks above.
  const admin = createSupabaseAdminClient();
  const path = `${org.id}/imports/${randomUUID()}.csv`;
  const up = await admin.storage.from("org-files").upload(path, bytes, { contentType: "text/csv", upsert: false });
  if (up.error) return { status: "error", message: "Could not store the file. Nothing was imported." };
  const fileRow = await admin
    .from("files")
    .insert({
      org_id: org.id,
      bucket: "org-files",
      path,
      mime: "text/csv",
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      kind: "contact_import",
      sensitivity: "internal",
      uploaded_by: session.userId,
      created_by: session.userId,
    })
    .select("id")
    .single();
  if (fileRow.error || !fileRow.data) return { status: "error", message: "Could not record the file." };

  return {
    status: "preview",
    fileId: fileRow.data.id,
    headers,
    mapping: guessMapping(headers),
    sample: rows.slice(1, 6),
    rowCount: rows.length - 1,
  };
}

/** Step 2: import with the chosen mapping, deduping by email and phone. */
export async function runImport(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const { org, allowed, supabase } = await importCtx(String(formData.get("org") ?? ""));
  if (!allowed) return { status: "error", message: "Your role can't import contacts." };
  const fileId = String(formData.get("file_id") ?? "");
  if (!z.uuid().safeParse(fileId).success) return { status: "error", message: "Upload the file again." };

  const { data: f } = await supabase
    .from("files")
    .select("path, kind")
    .eq("id", fileId)
    .eq("org_id", org.id)
    .maybeSingle();
  if (!f || f.kind !== "contact_import") return { status: "error", message: "Upload the file again." };
  const dl = await supabase.storage.from("org-files").download(f.path);
  if (dl.error || !dl.data) return { status: "error", message: "Could not read the stored file." };
  const rows = parseCsv(await dl.data.text(), MAX_ROWS + 1);
  const headers = rows[0].map((h) => h.trim());
  // Defense in depth: re-check in case a template was added since the preview.
  if (await guardMatch(supabase, org.id, headers))
    return { status: "error", message: "This file now matches a protected template and can't be imported." };

  const mapping: Record<string, ContactField | ""> = {};
  headers.forEach((h, i) => {
    const v = String(formData.get(`map_${i}`) ?? "");
    mapping[h] = (CONTACT_FIELDS as readonly string[]).includes(v) ? (v as ContactField) : "";
  });
  if (!Object.values(mapping).some((v) => v === "email" || v === "phone"))
    return { status: "error", message: "Map at least an email or phone column." };

  const brandId = String(formData.get("brand_id") ?? "") || null;
  if (brandId && !(await getVisibleBrands(org.id)).some((b) => b.id === brandId))
    return { status: "error", message: "Pick one of your brands." };

  // Dedupe (email/phone, within the file and against every contact in the org)
  // and company lookup happen in the database, in one call.
  const { data: result, error } = await supabase.rpc("import_contacts", {
    p_org: org.id,
    p_brand: brandId as string,
    p_rows: mapRows(rows.slice(1), headers, mapping),
  });
  if (error) {
    if (error.code === "22023" || error.code === "42501") return { status: "error", message: error.message };
    console.error("import_contacts failed", error.code);
    return { status: "error", message: "Import failed. Nothing was imported." };
  }
  const plan = result as { imported: number; duplicates: number; invalid: number };
  await appAudit({
    orgId: org.id,
    action: "app.import.completed",
    subjectType: "files",
    subjectId: fileId,
    after: { imported: plan.imported, duplicates: plan.duplicates, skipped: plan.invalid },
  });
  revalidatePath(`/${org.slug}/crm`, "layout");
  return {
    status: "ok",
    message: `Imported ${plan.imported} contact${plan.imported === 1 ? "" : "s"}. Skipped ${plan.duplicates} duplicate${plan.duplicates === 1 ? "" : "s"} and ${plan.invalid} row${plan.invalid === 1 ? "" : "s"} without an email or phone.`,
  };
}
