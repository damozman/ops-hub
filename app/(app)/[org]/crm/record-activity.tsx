import { ActionForm } from "@/components/action-form";
import { Card, CardTitle, Badge } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { addActivity, addComment, createTask, setTaskStatus } from "./actions";
import { listActivities, listComments, listTasks } from "@/server/crm/queries";
import { when, type CrmContext } from "@/server/crm/context";
import { Button } from "@/components/ui/button";

type Subject = { type: "company" | "contact" | "deal"; id: string };

/** Activities, comments (with @mentions) and tasks for one record. */
export async function RecordActivity({ ctx, subject }: { ctx: CrmContext; subject: Subject }) {
  const [activities, comments, tasks] = await Promise.all([
    listActivities(ctx.org.id, subject.type, [subject.id]),
    listComments(ctx.org.id, subject.type, subject.id),
    listTasks(ctx.org.id, { subjectType: subject.type, subjectId: subject.id }),
  ]);
  const name = (id: string | null) => ctx.people.find((p) => p.id === id)?.name ?? "Someone";
  const hidden = (
    <>
      <input type="hidden" name="org" value={ctx.slug} />
      <input type="hidden" name="subject_type" value={subject.type} />
      <input type="hidden" name="subject_id" value={subject.id} />
    </>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardTitle className="mb-3">Timeline</CardTitle>
        {ctx.canWrite && (
          <ActionForm action={addActivity} submitLabel="Log" resetOnOk className="mb-4 space-y-2">
            {hidden}
            <div className="flex gap-2">
              <Select name="kind" aria-label="Kind" className="w-32">
                <option value="note">Note</option>
                <option value="call">Call</option>
                <option value="meeting">Meeting</option>
                <option value="email_logged">Email</option>
              </Select>
              <Input name="body" aria-label="Activity" placeholder="What happened?" required />
            </div>
          </ActionForm>
        )}
        <ul className="space-y-2 text-sm" data-testid="timeline">
          {activities.length === 0 && <li className="text-muted-foreground">Nothing logged yet.</li>}
          {activities.map((a) => (
            <li key={a.id} className="border-b border-border pb-2">
              <Badge className="mr-2">{a.kind.replace("_", " ")}</Badge>
              {a.body}
              <div className="text-xs text-muted-foreground">
                {name(a.created_by)} · {when(a.occurred_at)}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardTitle className="mb-3">Tasks</CardTitle>
          <ul className="mb-3 space-y-2 text-sm" data-testid="record-tasks">
            {tasks.length === 0 && <li className="text-muted-foreground">No tasks.</li>}
            {tasks.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 border-b border-border pb-2">
                <span className={t.status === "done" ? "text-muted-foreground line-through" : ""}>
                  {t.title}
                  <span className="block text-xs text-muted-foreground">
                    {t.assignee_user_id ? name(t.assignee_user_id) : "Unassigned"}
                    {t.due_at ? ` · due ${when(t.due_at)}` : ""}
                  </span>
                </span>
                {ctx.canWrite && t.status === "open" && (
                  <form action={setTaskStatus}>
                    <input type="hidden" name="org" value={ctx.slug} />
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
          {ctx.canWrite && <TaskFields ctx={ctx} subject={subject} />}
        </Card>

        <Card>
          <CardTitle className="mb-3">Comments</CardTitle>
          <ul className="mb-3 space-y-2 text-sm" data-testid="comments">
            {comments.map((c) => (
              <li key={c.id} className="border-b border-border pb-2">
                <p className="whitespace-pre-wrap">{c.body_md}</p>
                <div className="text-xs text-muted-foreground">
                  {name(c.created_by)} · {when(c.created_at)}
                  {c.updated_at && c.updated_at !== c.created_at ? " · edited" : ""}
                </div>
              </li>
            ))}
          </ul>
          {ctx.canWrite ? (
            <ActionForm action={addComment} submitLabel="Comment" resetOnOk className="space-y-2">
              {hidden}
              <Label htmlFor={`comment-${subject.id}`}>Add a comment (type @Name to notify someone)</Label>
              <textarea
                id={`comment-${subject.id}`}
                name="body"
                required
                rows={3}
                className="w-full rounded-md border border-border bg-background p-2 text-sm"
              />
            </ActionForm>
          ) : (
            <p className="text-sm text-muted-foreground">Your role can read comments but not add them.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

export function TaskFields({ ctx, subject }: { ctx: CrmContext; subject?: Subject }) {
  return (
    <ActionForm action={createTask} submitLabel="Add task" resetOnOk className="space-y-2" testId="task-form">
      <input type="hidden" name="org" value={ctx.slug} />
      {subject && (
        <>
          <input type="hidden" name="subject_type" value={subject.type} />
          <input type="hidden" name="subject_id" value={subject.id} />
        </>
      )}
      <Input name="title" aria-label="Task title" placeholder="New task" required />
      <div className="grid gap-2 sm:grid-cols-4">
        <Select name="assignee" aria-label="Assignee" defaultValue={ctx.session.userId}>
          <option value="">Unassigned</option>
          {ctx.people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Input name="due" type="date" aria-label="Due date" />
        <Select name="priority" aria-label="Priority" defaultValue="normal">
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
        </Select>
        <Select name="recurring_rule" aria-label="Repeats" defaultValue="">
          <option value="">Does not repeat</option>
          <option value="RRULE:FREQ=WEEKLY">Weekly</option>
          <option value="RRULE:FREQ=MONTHLY">Monthly</option>
        </Select>
      </div>
    </ActionForm>
  );
}
