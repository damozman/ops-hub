import "server-only";
import { serverEnv } from "@/server/config/env";

export type MailMessage = { to: string; subject: string; text: string; html?: string; from?: string };

/** Pluggable mailer. Phases 0-2 ship only the local driver (the Mailpit catcher); nothing leaves the machine. */
export interface Mailer {
  send(message: MailMessage): Promise<{ id: string | null }>;
}

const DEFAULT_FROM = "Ops Hub <no-reply@ops-hub.example.test>";

export function localMailer(baseUrl: string): Mailer {
  const url = new URL(baseUrl);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && !url.hostname.endsWith(".localhost")) {
    throw new Error("The local mailer only talks to a mail catcher on this machine");
  }
  return {
    async send(m) {
      const res = await fetch(new URL("/api/v1/send", url), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          From: { Email: (m.from ?? DEFAULT_FROM).replace(/^.*<|>$/g, ""), Name: "Ops Hub" },
          To: [{ Email: m.to }],
          Subject: m.subject,
          Text: m.text,
          HTML: m.html,
        }),
      });
      if (!res.ok) throw new Error(`local mailer failed with ${res.status}`);
      const body = (await res.json().catch(() => ({}))) as { ID?: string };
      return { id: body.ID ?? null };
    },
  };
}

export function getMailer(): Mailer {
  const env = serverEnv();
  switch (env.MAILER_DRIVER) {
    case "local":
      return localMailer(env.MAILPIT_URL);
    default:
      throw new Error(`Mailer driver ${env.MAILER_DRIVER} is not available yet`);
  }
}
