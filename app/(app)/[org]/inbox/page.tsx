import Link from "next/link";
import { crmContext, when } from "@/server/crm/context";
import { listNotifications } from "@/server/crm/queries";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { markNotificationsRead } from "../crm/actions";

const SUBJECT_PATH: Record<string, string> = { company: "crm/companies", contact: "crm/contacts", deal: "crm/deals" };

function describe(kind: string, payload: Record<string, unknown>) {
  const p = (k: string) => (typeof payload[k] === "string" ? (payload[k] as string) : "");
  switch (kind) {
    case "mention":
      return `You were mentioned: “${p("excerpt")}”`;
    case "task_assigned":
      return `Task assigned to you: ${p("title")}`;
    case "form_submitted":
      return `New form submission: ${p("form") || "lead form"}${p("name") ? ` from ${p("name")}` : ""}`;
    default:
      return kind.replace(/_/g, " ");
  }
}

export default async function InboxPage({ params }: PageProps<"/[org]/inbox">) {
  const { org: slug } = await params;
  const ctx = await crmContext(slug);
  const items = await listNotifications(ctx.org.id);
  const unread = items.filter((n) => !n.read_at).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Inbox</h1>
        {unread > 0 && (
          <form action={markNotificationsRead}>
            <input type="hidden" name="org" value={slug} />
            <Button size="sm" variant="outline" type="submit">
              Mark all read
            </Button>
          </form>
        )}
      </div>
      <Card>
        <ul className="space-y-2 text-sm" data-testid="notifications">
          {items.length === 0 && <li className="text-muted-foreground">Nothing here yet.</li>}
          {items.map((n) => {
            const path =
              n.subject_type === "deal"
                ? SUBJECT_PATH.deal
                : n.subject_type && n.subject_id && SUBJECT_PATH[n.subject_type]
                  ? `${SUBJECT_PATH[n.subject_type]}/${n.subject_id}`
                  : n.subject_type === "task"
                    ? "tasks"
                    : null;
            return (
              <li
                key={n.id}
                data-unread={!n.read_at}
                className={`flex items-center justify-between gap-3 border-b border-border pb-2 ${n.read_at ? "text-muted-foreground" : ""}`}
              >
                <div>
                  {path ? (
                    <Link href={`/${slug}/${path}`} className="hover:underline">
                      {describe(n.kind, (n.payload ?? {}) as Record<string, unknown>)}
                    </Link>
                  ) : (
                    describe(n.kind, (n.payload ?? {}) as Record<string, unknown>)
                  )}
                  <div className="text-xs text-muted-foreground">{when(n.created_at)}</div>
                </div>
                {!n.read_at && (
                  <form action={markNotificationsRead}>
                    <input type="hidden" name="org" value={slug} />
                    <input type="hidden" name="id" value={n.id} />
                    <Button size="sm" variant="ghost" type="submit">
                      Mark read
                    </Button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
