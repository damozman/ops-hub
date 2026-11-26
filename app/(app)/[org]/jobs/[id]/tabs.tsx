import Link from "next/link";
import type { JobsContext } from "@/server/jobs/context";
import { DRAFT_KINDS, draftKindLabel } from "@/server/jobs/context";
import type { ChecklistItem, getJob, getJobDetail } from "@/server/jobs/queries";
import { when } from "@/server/crm/context";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import {
  addDeliverable,
  addFinding,
  addJobItem,
  createDraft,
  finishAudit,
  saveOutbox,
  setChecklistItem,
  setDraftScope,
  startAudit,
  updateJob,
} from "../actions";
import { OutboxList } from "../../outbox/outbox-list";

type Props = {
  ctx: JobsContext;
  job: NonNullable<Awaited<ReturnType<typeof getJob>>>;
  detail: Awaited<ReturnType<typeof getJobDetail>>;
  slug: string;
};

const textarea =
  "flex min-h-20 w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const personName = (ctx: JobsContext, id: string | null | undefined) =>
  ctx.people.find((p) => p.id === id)?.name ?? "Someone";

// ---------------------------------------------------------------------------
export function OverviewTab({ ctx, job, detail, slug }: Props) {
  const due = job.due_at ? new Date(job.due_at).toISOString().slice(0, 10) : "";
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardTitle className="mb-3">Details</CardTitle>
        {ctx.canWrite ? (
          <ActionForm action={updateJob} submitLabel="Save job" className="space-y-3">
            <input type="hidden" name="org" value={slug} />
            <input type="hidden" name="job_id" value={job.id} />
            <div className="space-y-1">
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" defaultValue={job.title} required maxLength={200} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="assignee_user_id">Assignee</Label>
                <Select id="assignee_user_id" name="assignee_user_id" defaultValue={job.assignee_user_id ?? ""}>
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
                <Select id="reviewer_user_id" name="reviewer_user_id" defaultValue={job.reviewer_user_id ?? ""}>
                  <option value="">None</option>
                  {ctx.people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="due_date">Due</Label>
                <Input id="due_date" name="due_date" type="date" defaultValue={due} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="contract_ref">Contract / proposal reference</Label>
                <Input id="contract_ref" name="contract_ref" defaultValue={job.contract_ref ?? ""} maxLength={200} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="scope">Scope (JSON)</Label>
              <textarea
                id="scope"
                name="scope"
                className={textarea}
                defaultValue={JSON.stringify(job.scope ?? {}, null, 2)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="requires_client_approval" defaultChecked={job.requires_client_approval} />{" "}
              Requires client approval (portal arrives in Phase 7; G4 will block until then)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="subscription_active" defaultChecked={job.subscription_active} /> Upkeep
              subscription active (G6)
            </label>
          </ActionForm>
        ) : (
          <dl className="space-y-1 text-sm">
            <div>Assignee: {personName(ctx, job.assignee_user_id)}</div>
            <div>Reviewer: {personName(ctx, job.reviewer_user_id)}</div>
            <div>Due: {when(job.due_at)}</div>
          </dl>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Client data:{" "}
          {job.client_accounts?.data_sensitivity === "client_confidential" ? "client confidential" : "public only"}; AI
          policy: {job.client_accounts?.ai_policy === "local_only" ? "local only" : "default"}.
        </p>
      </Card>

      <Card>
        <CardTitle className="mb-3">Items ({detail.items.length})</CardTitle>
        <ul className="space-y-2 text-sm" data-testid="job-items">
          {detail.items.map((i) => (
            <li key={i.id} className="rounded-md border border-border p-2">
              <div className="font-medium">
                {i.title} <Badge>{i.marketplace}</Badge> <Badge>{i.kind}</Badge>
              </div>
              {i.external_ref && <div className="text-xs text-muted-foreground">Ref {i.external_ref}</div>}
              <details className="mt-1 text-xs">
                <summary className="cursor-pointer text-muted-foreground">Source data</summary>
                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(i.source_data, null, 2)}</pre>
              </details>
            </li>
          ))}
        </ul>
        {ctx.canWrite && (
          <ActionForm action={addJobItem} submitLabel="Add item" resetOnOk className="mt-4 space-y-2">
            <input type="hidden" name="org" value={slug} />
            <input type="hidden" name="job_id" value={job.id} />
            <div className="grid gap-2 sm:grid-cols-2">
              <Input name="title" placeholder="Item title" aria-label="Item title" required />
              <Input name="external_ref" placeholder="SKU / ASIN / location ref" aria-label="External reference" />
              <Select name="kind" aria-label="Kind" defaultValue={job.offer === "A" ? "listing" : "location"}>
                <option value="listing">Listing</option>
                <option value="location">Location</option>
                <option value="asset">Asset</option>
              </Select>
              <Select name="marketplace" aria-label="Marketplace" defaultValue={job.offer === "A" ? "amazon" : "gbp"}>
                {["amazon", "walmart", "shopify", "gbp", "openai_feed", "other"].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </div>
            <textarea
              name="source_data"
              aria-label="Source data (JSON)"
              placeholder='Source data JSON, e.g. {"size_oz": 8}'
              className={textarea}
            />
          </ActionForm>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Checklist({ ctx, job, slug, list, items }: Props & { list: "intake" | "delivery"; items: ChecklistItem[] }) {
  return (
    <ul className="space-y-2" data-testid={`${list}-checklist`}>
      {items.map((i) => (
        <li key={i.key} className="rounded-md border border-border p-3 text-sm" data-testid={`check-${i.key}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span aria-hidden>{i.done ? "☑" : "☐"}</span>
            <span className={i.done ? "font-medium" : ""}>{i.label}</span>
            {i.done && (
              <span className="text-xs text-muted-foreground">
                by {personName(ctx, i.done_by)} {when(i.done_at)}
                {i.evidence ? ` · ${i.evidence}` : ""}
              </span>
            )}
          </div>
          {ctx.canWrite && (
            <ActionForm
              action={setChecklistItem}
              submitLabel={i.done ? "Undo" : "Mark done"}
              className="mt-2 flex flex-wrap items-center gap-2"
            >
              <input type="hidden" name="org" value={slug} />
              <input type="hidden" name="job_id" value={job.id} />
              <input type="hidden" name="list" value={list} />
              <input type="hidden" name="key" value={i.key} />
              <input type="hidden" name="done" value={i.done ? "false" : "true"} />
              {!i.done && (
                <Input
                  name="evidence"
                  placeholder="Evidence or note (optional)"
                  aria-label={`Evidence for ${i.label}`}
                  className="max-w-sm"
                />
              )}
            </ActionForm>
          )}
        </li>
      ))}
    </ul>
  );
}

export function IntakeTab(props: Props) {
  return (
    <Card>
      <CardTitle>Intake checklist</CardTitle>
      <CardDescription className="mb-3 mt-1">
        All items must be done before the job can move to audit (G1).
      </CardDescription>
      <Checklist {...props} list="intake" items={props.detail.intake} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
export function AuditTab({ ctx, job, detail, slug }: Props) {
  const running = detail.audits.find((a) => a.status === "running");
  return (
    <div className="space-y-4">
      {ctx.canWrite && !running && (
        <ActionForm action={startAudit} submitLabel="Start a manual audit" className="flex items-center gap-2">
          <input type="hidden" name="org" value={slug} />
          <input type="hidden" name="job_id" value={job.id} />
        </ActionForm>
      )}
      {detail.audits.length === 0 && (
        <p className="text-sm text-muted-foreground">No audits yet. Automated engines arrive in Phases 4 and 5.</p>
      )}
      {detail.audits.map((a) => (
        <Card key={a.id} data-testid={`audit-${a.status}`}>
          <CardTitle>
            {a.engine} audit <Badge>{a.status}</Badge> {a.score !== null && <Badge>score {a.score}</Badge>}
          </CardTitle>
          <CardDescription className="mt-1">
            Started {when(a.created_at)}
            {a.finished_at ? ` · finished ${when(a.finished_at)}` : ""} · rules {a.rules_version ?? "not set"}
          </CardDescription>
          <ul className="mt-3 space-y-1 text-sm">
            {a.audit_findings.length === 0 && <li className="text-muted-foreground">No findings recorded.</li>}
            {a.audit_findings.map((f) => (
              <li key={f.id}>
                <Badge>{f.severity}</Badge> {f.field ? <span className="font-mono text-xs">{f.field}</span> : null}{" "}
                {f.message}
                {f.job_item_id && (
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    · {detail.items.find((i) => i.id === f.job_item_id)?.title}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {ctx.canWrite && a.status === "running" && (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <ActionForm action={addFinding} submitLabel="Add finding" resetOnOk className="space-y-2">
                <input type="hidden" name="org" value={slug} />
                <input type="hidden" name="audit_id" value={a.id} />
                <div className="grid grid-cols-2 gap-2">
                  <Select name="severity" aria-label="Severity" defaultValue="major">
                    <option value="blocker">blocker</option>
                    <option value="major">major</option>
                    <option value="minor">minor</option>
                    <option value="info">info</option>
                  </Select>
                  <Input name="field" placeholder="Field (e.g. title)" aria-label="Field" />
                </div>
                <Select name="job_item_id" aria-label="Item">
                  <option value="">Whole job</option>
                  {detail.items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.title}
                    </option>
                  ))}
                </Select>
                <Input name="message" placeholder="What's wrong and why" aria-label="Finding" required />
              </ActionForm>
              <ActionForm action={finishAudit} submitLabel="Finish audit" className="space-y-2">
                <input type="hidden" name="org" value={slug} />
                <input type="hidden" name="audit_id" value={a.id} />
                <Input
                  name="score"
                  type="number"
                  min={0}
                  max={100}
                  placeholder="Score 0-100 (optional)"
                  aria-label="Score"
                />
                <Input name="rules_version" defaultValue={a.rules_version ?? "manual-v1"} aria-label="Rules version" />
              </ActionForm>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
const STATUS_TONE: Record<string, string> = {
  checks_failed: "border-destructive/50 text-destructive",
  ready_for_review: "border-amber-500/50",
  approved: "border-emerald-500/50 text-emerald-700 dark:text-emerald-300",
  changes_requested: "border-destructive/50",
};

export function DraftsTab({ ctx, job, detail, slug }: Props) {
  return (
    <div className="space-y-4">
      <Card>
        <ul className="divide-y divide-border text-sm" data-testid="drafts">
          {detail.drafts.length === 0 && <li className="py-2 text-muted-foreground">No drafts yet.</li>}
          {detail.drafts.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 py-2">
              <Link href={`/${slug}/jobs/${job.id}/drafts/${d.id}`} className="font-medium underline">
                {d.title || draftKindLabel(d.kind)}
              </Link>
              <Badge>{draftKindLabel(d.kind)}</Badge>
              <Badge className={STATUS_TONE[d.status]} data-testid="draft-status">
                {d.status.replace(/_/g, " ")}
              </Badge>
              {!d.in_scope && <Badge>out of scope</Badge>}
              <span className="text-xs text-muted-foreground">v{d.draft_versions.length}</span>
              {ctx.canWriteDrafts && (
                <form action={setDraftScopeForm} className="ml-auto">
                  <input type="hidden" name="org" value={slug} />
                  <input type="hidden" name="draft_id" value={d.id} />
                  <input type="hidden" name="in_scope" value={d.in_scope ? "false" : "true"} />
                  <button className="text-xs text-muted-foreground underline">
                    {d.in_scope ? "Mark out of scope" : "Mark in scope"}
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </Card>
      {ctx.canWriteDrafts && !["delivered", "closed", "cancelled"].includes(job.stage) && (
        <Card>
          <CardTitle className="mb-3">New draft</CardTitle>
          <ActionForm action={createDraft} submitLabel="Create draft" className="grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="org" value={slug} />
            <input type="hidden" name="job_id" value={job.id} />
            <div className="space-y-1">
              <Label htmlFor="kind">Type</Label>
              <Select id="kind" name="kind" defaultValue={job.offer === "A" ? "listing" : "gbp_description"}>
                {DRAFT_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="job_item_id">Item</Label>
              <Select id="job_item_id" name="job_item_id">
                <option value="">No item</option>
                {detail.items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.title}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="draft_title">Name</Label>
              <Input id="draft_title" name="draft_title" placeholder="e.g. Wildflower listing" maxLength={200} />
            </div>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}

async function setDraftScopeForm(formData: FormData) {
  "use server";
  await setDraftScope({ status: "idle" }, formData);
}

// ---------------------------------------------------------------------------
export function ReviewTab({ job, detail, slug }: Props) {
  const inScope = detail.drafts.filter((d) => d.in_scope && d.status !== "superseded");
  return (
    <Card>
      <CardTitle>Review</CardTitle>
      <CardDescription className="mb-3 mt-1">
        Each in-scope draft needs a human approval of its current version (G4). With the two-person rule on, the
        approver can&apos;t be the person who wrote it.{" "}
        {job.stage !== "review" && "Approvals open when the job is in review."}
      </CardDescription>
      <ul className="divide-y divide-border text-sm">
        {inScope.map((d) => (
          <li key={d.id} className="flex items-center gap-2 py-2">
            <Link href={`/${slug}/jobs/${job.id}/drafts/${d.id}`} className="font-medium underline">
              {d.title || draftKindLabel(d.kind)}
            </Link>
            <Badge className={STATUS_TONE[d.status]}>{d.status.replace(/_/g, " ")}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------------------
export function DeliveryTab(props: Props) {
  const { ctx, job, detail, slug } = props;
  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>Delivery checklist</CardTitle>
        <CardDescription className="mb-3 mt-1">
          Needed for G5, with every outbox item sent or cancelled.
        </CardDescription>
        <Checklist {...props} list="delivery" items={detail.delivery} />
      </Card>
      <Card>
        <CardTitle className="mb-3">Outbox for this job</CardTitle>
        <OutboxList ctx={ctx} slug={slug} items={detail.outbox.map((o) => ({ ...o, jobs: null, brands: null }))} />
        {ctx.canWrite && (
          <ActionForm action={saveOutbox} submitLabel="Add outbox item" resetOnOk className="mt-4 space-y-2">
            <input type="hidden" name="org" value={slug} />
            <input type="hidden" name="job_id" value={job.id} />
            <input type="hidden" name="brand_id" value={job.brand_id} />
            <div className="grid gap-2 sm:grid-cols-3">
              <Select name="channel" aria-label="Channel" defaultValue="manual">
                {["manual", "email", "sms", "gbp_post", "gbp_reply", "listing_push"].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
              <Input name="recipient" placeholder="Recipient" aria-label="Recipient" />
              <Input name="subject" placeholder="Subject" aria-label="Subject" />
            </div>
            <textarea
              name="body"
              aria-label="Message"
              placeholder="Exact content to send or apply"
              className={textarea}
              required
            />
          </ActionForm>
        )}
      </Card>
      <Card>
        <CardTitle>Deliverables</CardTitle>
        <CardDescription className="mb-3 mt-1">
          Placeholders for now. Exports from approved hashes arrive in Phase 4.
        </CardDescription>
        <ul className="space-y-1 text-sm">
          {detail.deliverables.map((d) => (
            <li key={d.id}>
              {d.kind} <Badge>{d.status}</Badge>
            </li>
          ))}
        </ul>
        {ctx.canWrite && (
          <ActionForm
            action={addDeliverable}
            submitLabel="Add deliverable"
            resetOnOk
            className="mt-3 flex items-center gap-2"
          >
            <input type="hidden" name="org" value={slug} />
            <input type="hidden" name="job_id" value={job.id} />
            <Input
              name="kind"
              placeholder="e.g. Amazon flat file"
              aria-label="Deliverable"
              className="max-w-xs"
              required
            />
          </ActionForm>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function ActivityTab({ ctx, detail }: Props) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardTitle className="mb-3">Stage history</CardTitle>
        <ul className="space-y-2 text-sm" data-testid="stage-history">
          {detail.stageEvents.length === 0 && <li className="text-muted-foreground">No moves yet.</li>}
          {detail.stageEvents.map((e) => (
            <li key={e.id}>
              <span className="font-medium">
                {e.from_stage} → {e.to_stage}
              </span>{" "}
              <span className="text-xs text-muted-foreground">
                {e.actor_kind === "user" ? personName(ctx, e.actor_id) : e.actor_kind} · {when(e.at)}
              </span>
              {e.reason && <div className="text-xs">Reason: {e.reason.replace(/_/g, " ")}</div>}
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardTitle className="mb-3">Events</CardTitle>
        <ul className="space-y-1 text-xs">
          {detail.events.map((e) => (
            <li key={e.id}>
              <span className="font-mono">{e.type}</span> · {personName(ctx, e.actor_id)} · {when(e.at)}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
