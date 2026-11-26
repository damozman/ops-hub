import "server-only";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/server/db/admin-client";
import { serverEnv } from "@/server/config/env";
import { hashIp } from "@/server/audit";
import { normalizePhone } from "@/lib/csv";

export const formInputSchema = z.object({
  first_name: z.string().trim().max(100).default(""),
  last_name: z.string().trim().max(100).default(""),
  email: z.union([z.literal(""), z.email().max(254)]).default(""),
  phone: z.string().trim().max(40).default(""),
  company: z.string().trim().max(200).default(""),
  message: z.string().trim().max(5000).default(""),
});

export type SubmitResult =
  | { ok: true; redirectUrl: string | null }
  | { ok: false; reason: "invalid" | "spam" | "rate_limited" | "not_found" | "error"; message: string };

/**
 * Public lead form submission. The visitor is anonymous, so this is the one place
 * the service role writes CRM rows, and only through submit_form(), which checks
 * the honeypot, the per-IP rate limit and consent, and emits the events.
 */
export async function submitPublicForm(params: {
  formId: string;
  fields: Record<string, string>;
  consent: boolean;
  honeypot: string;
  ip: string | null;
}): Promise<SubmitResult> {
  if (!z.uuid().safeParse(params.formId).success) return { ok: false, reason: "not_found", message: "Form not found." };
  const parsed = formInputSchema.safeParse({
    ...params.fields,
    email: (params.fields.email ?? "").trim().toLowerCase(),
  });
  if (!parsed.success) return { ok: false, reason: "invalid", message: "Check your email address and try again." };
  // Store phones as E.164. A phone we can't read is dropped when there's an email, else it's an error.
  const phone = parsed.data.phone ? normalizePhone(parsed.data.phone) : null;
  if (parsed.data.phone && !phone && !parsed.data.email)
    return { ok: false, reason: "invalid", message: "Check your phone number (10 digits, or +country code)." };
  const input = { ...parsed.data, phone: phone ?? "" };
  if (!input.email && !input.phone)
    return { ok: false, reason: "invalid", message: "Give us an email or phone number." };

  const env = serverEnv();
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("submit_form", {
    p_form_id: params.formId,
    p_data: input,
    // Unknown IPs share one rate-limit bucket rather than skipping the limit.
    p_ip_hash: hashIp(params.ip ?? "unknown-ip", env.AUDIT_IP_HASH_SALT) as string,
    p_consent: params.consent,
    p_honeypot: params.honeypot,
    p_rate_limit_per_min: env.FORMS_RATE_LIMIT_PER_MIN,
  });
  if (error) {
    if (error.message?.includes("spam_rejected")) return { ok: false, reason: "spam", message: "Submission rejected." };
    if (error.message?.includes("rate_limited"))
      return { ok: false, reason: "rate_limited", message: "Too many submissions. Try again in a minute." };
    if (error.code === "P0002") return { ok: false, reason: "not_found", message: "Form not found." };
    if (error.code === "22023") return { ok: false, reason: "invalid", message: error.message };
    console.error("submit_form failed", error.code);
    return { ok: false, reason: "error", message: "Something went wrong. Please try again." };
  }
  const redirect = (data as { redirect_url?: string | null } | null)?.redirect_url ?? null;
  return { ok: true, redirectUrl: redirect && /^https:\/\//.test(redirect) ? redirect : null };
}

export function clientIp(h: Headers): string | null {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}
