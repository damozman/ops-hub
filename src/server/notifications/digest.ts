import "server-only";
import { createSupabaseAdminClient } from "@/server/db/admin-client";
import { serverEnv } from "@/server/config/env";
import { getMailer, type Mailer } from "@/server/mailer";

type Row = { id: string; user_id: string; org_id: string; kind: string; payload: unknown; created_at: string };

export function digestLine(n: Pick<Row, "kind" | "payload">): string {
  const p = (n.payload ?? {}) as Record<string, unknown>;
  const s = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : "");
  switch (n.kind) {
    case "mention":
      return `You were mentioned: "${s("excerpt")}"`;
    case "task_assigned":
      return `Task assigned to you: ${s("title")}`;
    case "form_submitted":
      return `New form submission (${s("form")})${s("name") ? ` from ${s("name")}` : ""}`;
    default:
      return n.kind.replace(/_/g, " ");
  }
}

/**
 * Daily digest: one email per person listing unread notifications not yet
 * digested. Uses the mailer interface (local mail catcher in Phases 0-2).
 */
export async function sendNotificationDigest(mailer: Mailer = getMailer()) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("notifications")
    .select("id, user_id, org_id, kind, payload, created_at")
    .is("read_at", null)
    .is("digested_at", null)
    .order("created_at")
    .limit(5000);
  if (error) throw new Error(`digest query failed (${error.code})`);
  const byUser = new Map<string, Row[]>();
  for (const n of (data ?? []) as Row[]) byUser.set(n.user_id, [...(byUser.get(n.user_id) ?? []), n]);

  const base = serverEnv().APP_BASE_URL;
  let emails = 0;
  for (const [userId, rows] of byUser) {
    const { data: u } = await admin.auth.admin.getUserById(userId);
    const to = u.user?.email;
    if (!to) continue;
    const text = [
      `You have ${rows.length} unread notification${rows.length === 1 ? "" : "s"} in Ops Hub:`,
      "",
      ...rows.map((r) => `- ${digestLine(r)}`),
      "",
      `Open your inbox: ${base}/`,
    ].join("\n");
    await mailer.send({ to, subject: `Ops Hub: ${rows.length} unread`, text });
    const { error: markErr } = await admin.rpc("mark_notifications_digested", { p_ids: rows.map((r) => r.id) });
    if (markErr) throw new Error(`marking digested failed (${markErr.code})`);
    emails++;
  }
  return { emails, notifications: data?.length ?? 0 };
}
