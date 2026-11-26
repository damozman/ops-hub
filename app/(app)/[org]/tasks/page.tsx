import Link from "next/link";
import { crmContext, when } from "@/server/crm/context";
import { listTasks } from "@/server/crm/queries";
import { Badge, Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NotAllowed } from "../not-allowed";
import { setTaskStatus } from "../crm/actions";
import { TaskFields } from "../crm/record-activity";

const SUBJECT_PATH: Record<string, string> = { company: "companies", contact: "contacts" };

export default async function TasksPage({ params, searchParams }: PageProps<"/[org]/tasks">) {
  const { org: slug } = await params;
  const { view } = await searchParams;
  const ctx = await crmContext(slug);
  if (!ctx.canRead) return <NotAllowed what="tasks" />;
  const mine = view !== "all";
  const tasks = await listTasks(ctx.org.id, {
    status: "open",
    activeBrand: ctx.active,
    ...(mine ? { assignee: ctx.session.userId } : {}),
  });
  const name = (id: string | null) => ctx.people.find((p) => p.id === id)?.name ?? "Unassigned";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Tasks</h1>
        <Link href={`/${slug}/tasks`} className={mine ? "font-medium" : "text-muted-foreground"}>
          Mine
        </Link>
        <Link href={`/${slug}/tasks?view=all`} className={!mine ? "font-medium" : "text-muted-foreground"}>
          Everyone
        </Link>
      </div>
      <Card>
        <ul className="space-y-2 text-sm" data-testid="task-list">
          {tasks.length === 0 && <li className="text-muted-foreground">No open tasks.</li>}
          {tasks.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 border-b border-border pb-2">
              <div>
                <div className="font-medium">
                  {t.title} {t.priority === "high" && <Badge>high</Badge>}{" "}
                  {t.recurring_rule && <Badge>{t.recurring_rule.includes("WEEKLY") ? "weekly" : "monthly"}</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {name(t.assignee_user_id)}
                  {t.due_at ? ` · due ${when(t.due_at)}` : ""}
                  {t.subject_type && t.subject_id && SUBJECT_PATH[t.subject_type] ? (
                    <>
                      {" · "}
                      <Link href={`/${slug}/crm/${SUBJECT_PATH[t.subject_type]}/${t.subject_id}`} className="underline">
                        open {t.subject_type}
                      </Link>
                    </>
                  ) : null}
                </div>
              </div>
              {ctx.canWrite && (
                <form action={setTaskStatus}>
                  <input type="hidden" name="org" value={slug} />
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="status" value="done" />
                  <Button size="sm" variant="outline" type="submit">
                    Done
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </Card>
      {ctx.canWrite && (
        <Card>
          <CardTitle className="mb-3">New task</CardTitle>
          <TaskFields ctx={ctx} />
        </Card>
      )}
    </div>
  );
}
