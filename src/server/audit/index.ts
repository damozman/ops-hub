import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { serverEnv } from "@/server/config/env";
import { createSupabaseServerClient } from "@/server/db/server-client";
import type { Json } from "@/types/db";

/** Salted hash so the log can correlate requests without storing raw IPs (BUILD_PLAN §5.14). */
export function hashIp(ip: string | null, salt: string): string | null {
  if (!ip) return null;
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/** App-level audit entry (sign-in, MFA, invitations). Row changes are audited by DB triggers. */
export async function appAudit(params: {
  orgId: string | null;
  action: `app.${string}`;
  subjectType: string;
  subjectId: string | null;
  after?: Json;
}) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("app_audit", {
    p_org: params.orgId as string,
    p_action: params.action,
    p_subject_type: params.subjectType,
    p_subject_id: params.subjectId as string,
    p_after: params.after ?? null,
    p_ip_hash: hashIp(ip ?? null, serverEnv().AUDIT_IP_HASH_SALT) as string,
  });
  if (error) console.error("app_audit failed", error.code);
}
