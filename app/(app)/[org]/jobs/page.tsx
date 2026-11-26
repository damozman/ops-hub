import Link from "next/link";
import { jobsContext, STAGE_LABELS, STAGES } from "@/server/jobs/context";
import { listClientAccounts, listJobs } from "@/server/jobs/queries";
import { when } from "@/server/crm/context";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { NotAllowed } from "../not-allowed";
import { createJob } from "./actions";
import { JobsNav } from "./jobs-nav";

export default async function JobsPage({ params, searchParams }: PageProps<"/[org]/jobs">) {
  const { org: slug } = await params;
  const { show } = await searchParams;
  const ctx = await jobsContext(slug);
  if (!ctx.canRead) return <NotAllowed what="jobs" />;
  const [jobs, accounts] = await Promise.all([
    listJobs(ctx.org.id, ctx.active),
    listClientAccounts(ctx.org.id, ctx.active),
  ]);
  const stages = show === "all" ? STAGES : STAGES.filter((s) => s !== "closed" && s !== "cancelled");
  const name = (id: string | null) => ctx.people.find((p) => p.id === id)?.name ?? "Unassigned";

  return (
    <div className="space-y-6">
      <JobsNav slug={slug} current="jobs" />
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Jobs</h1>
        <Link
          href={`/${slug}/jobs${show === "all" ? "" : "?show=all"}`}
          className="text-sm text-muted-foreground underline"
        >
          {show === "all" ? "Hide closed and cancelled" : "Show closed and cancelled"}
        </Link>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2" data-testid="job-board">
        {stages.map((s) => {
          const col = jobs.filter((j) => j.stage === s);
          return (
            <section
              key={s}
              className="w-56 shrink-0 rounded-lg border border-border bg-muted/40 p-2"
              data-testid={`stage-${s}`}
            >
              <h2 className="mb-2 flex items-center justify-between text-sm font-medium">
                {STAGE_LABELS[s]} <span className="text-xs text-muted-foreground">{col.length}</span>
              </h2>
              <ul className="space-y-2">
                {col.map((j) => (
                  <li key={j.id}>
                    <Link
                      href={`/${slug}/jobs/${j.id}`}
                      className="block rounded-md border border-border bg-card p-2 text-sm hover:bg-muted"
                    >
                      <div className="font-medium">{j.title}</div>
                      <div className="mt-1 flex flex-wrap gap-1 text-xs text-muted-foreground">
                        <Badge>Offer {j.offer}</Badge>
                        <span>{j.brands?.name}</span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {j.client_accounts?.companies?.name} · {name(j.assignee_user_id)}
                        {j.due_at ? ` · due ${when(j.due_at)}` : ""}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {ctx.canWrite && (
        <Card>
          <CardTitle className="mb-3">New job</CardTitle>
          {accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Create a{" "}
              <Link href={`/${slug}/jobs/clients`} className="underline">
                client account
              </Link>{" "}
              first.
            </p>
          ) : (
            <ActionForm action={createJob} submitLabel="Create job" className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="org" value={slug} />
              <div className="space-y-1">
                <Label htmlFor="client_account_id">Client account</Label>
                <Select id="client_account_id" name="client_account_id" required>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.companies?.name} ({a.brands?.name})
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="title">Title</Label>
                <Input id="title" name="title" required maxLength={200} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="offer">Offer</Label>
                <Select id="offer" name="offer">
                  <option value="A">A: listings</option>
                  <option value="B">B: local</option>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="due_date">Due</Label>
                <Input id="due_date" name="due_date" type="date" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="assignee_user_id">Assignee</Label>
                <Select id="assignee_user_id" name="assignee_user_id" defaultValue={ctx.session.userId}>
                  <option value="">Unassigned</option>
                  {ctx.people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="reviewer_user_id">Reviewer</Label>
                <Select id="reviewer_user_id" name="reviewer_user_id">
                  <option value="">None</option>
                  {ctx.people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="contract_ref">Contract / proposal reference</Label>
                <Input id="contract_ref" name="contract_ref" maxLength={200} />
              </div>
              {(ctx.org.role === "owner" || ctx.org.role === "admin") && (
                <label className="flex items-center gap-2 self-end text-sm">
                  <input type="checkbox" name="requires_client_approval" /> Requires client approval (portal: Phase 7)
                </label>
              )}
            </ActionForm>
          )}
        </Card>
      )}
    </div>
  );
}
