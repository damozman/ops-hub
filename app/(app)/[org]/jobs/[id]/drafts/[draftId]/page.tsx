import Link from "next/link";
import { notFound } from "next/navigation";
import { draftKindLabel, jobsContext } from "@/server/jobs/context";
import { getDraft, getJob } from "@/server/jobs/queries";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { when } from "@/server/crm/context";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { DiffViewer } from "@/components/jobs/diff-viewer";
import type { Span } from "@/server/checks/types";
import { NotAllowed } from "../../../../not-allowed";
import { decide, overrideCheck, saveDraftVersion } from "../../../actions";

const textarea =
  "flex min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Content = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : "");

export default async function DraftPage({ params, searchParams }: PageProps<"/[org]/jobs/[id]/drafts/[draftId]">) {
  const { org: slug, id: jobId, draftId } = await params;
  const { base } = await searchParams;
  const ctx = await jobsContext(slug);
  if (!ctx.canRead) return <NotAllowed what="drafts" />;
  if (!/^[0-9a-f-]{36}$/.test(jobId) || !/^[0-9a-f-]{36}$/.test(draftId)) notFound();
  const [job, data] = await Promise.all([getJob(ctx.org.id, jobId), getDraft(jobId, draftId)]);
  if (!job || !data) notFound();
  const { draft, versions, runs, approvals } = data;
  const current = versions.find((v) => v.id === draft.current_version_id) ?? null;
  const previous = current ? versions.find((v) => v.version === current.version - 1) : undefined;
  const run = current ? runs.find((r) => r.draft_version_id === current.id) : undefined;
  const results = (run?.check_results ?? [])
    .slice()
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "blocker" ? -1 : 1));
  const openBlockers = results.filter((r) => r.severity === "blocker" && !r.override_by);
  const warnings = results.filter((r) => r.severity === "warning");
  const checksOk = !!run && openBlockers.length === 0;

  const supabase = await createSupabaseServerClient();
  const { data: twoPersonRow } = await supabase
    .from("settings")
    .select("value")
    .eq("org_id", ctx.org.id)
    .eq("key", "two_person_rule")
    .maybeSingle();
  const twoPerson = twoPersonRow?.value !== false;
  const humanEditors = versions.filter((v) => v.author_kind === "user");
  const lastHuman = humanEditors[0]?.author_id;
  const iWroteIt = current?.author_id === ctx.session.userId || lastHuman === ctx.session.userId;
  const name = (id: string | null | undefined) => ctx.people.find((p) => p.id === id)?.name ?? "Someone";

  const useSource = base === "source" || (!previous && base !== "previous");
  const before = useSource ? (draft.job_items?.source_data ?? {}) : (previous?.content ?? {});
  const beforeLabel = useSource
    ? draft.job_items
      ? `the item's source data (${draft.job_items.title})`
      : "nothing (no item linked)"
    : `version ${previous?.version}`;
  const content = (current?.content ?? {}) as Content;
  const editable = ctx.canWriteDrafts && !["delivered", "closed", "cancelled"].includes(job.stage);

  // ApprovalButton: disabled with a reason, or the two decision forms.
  let approveBlocked: string | null = null;
  if (!ctx.canApprove) approveBlocked = "Your role can't approve drafts.";
  else if (job.stage !== "review") approveBlocked = `Approvals open when the job is in review (it is in ${job.stage}).`;
  else if (!current) approveBlocked = "There is no content to approve yet.";
  else if (!run) approveBlocked = "Checks have not run on this version.";
  else if (!checksOk) approveBlocked = "This version has check blockers. Fix them or get an override.";
  else if (twoPerson && iWroteIt)
    approveBlocked = "Two-person rule: you wrote this version, so someone else approves it.";

  return (
    <div className="space-y-4">
      <Link href={`/${slug}/jobs/${jobId}?tab=drafts`} className="text-sm text-muted-foreground underline">
        ← {job.title}
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">{draft.title || draftKindLabel(draft.kind)}</h1>
        <Badge>{draftKindLabel(draft.kind)}</Badge>
        <Badge data-testid="draft-status">{draft.status.replace(/_/g, " ")}</Badge>
        {draft.job_items && <span className="text-sm text-muted-foreground">{draft.job_items.title}</span>}
        {current && (
          <span className="font-mono text-xs text-muted-foreground" title="Content hash of the current version">
            v{current.version} #{current.content_hash.slice(0, 10)}
          </span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <CardTitle>Before / after</CardTitle>
            <Link
              href={`?base=source`}
              className={useSource ? "text-xs font-medium" : "text-xs text-muted-foreground underline"}
            >
              vs source
            </Link>
            {previous && (
              <Link
                href={`?base=previous`}
                className={!useSource ? "text-xs font-medium" : "text-xs text-muted-foreground underline"}
              >
                vs previous version
              </Link>
            )}
          </div>
          {current ? (
            <DiffViewer
              before={before}
              after={current.content}
              beforeLabel={beforeLabel}
              spans={results.map((r) => r.span as Span | null).filter((x): x is Span => !!x)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">No content yet. Write the first version below.</p>
          )}
        </Card>

        <div className="space-y-4">
          <Card data-testid="check-results">
            <CardTitle>Checks</CardTitle>
            <CardDescription className="mt-1">
              {run
                ? `${run.blocker_count} blocker(s), ${run.warning_count} warning(s) · rules ${run.rules_version} · ${when(run.created_at)}`
                : "Not run yet."}
            </CardDescription>
            <ul className="mt-3 space-y-2 text-sm">
              {run && results.length === 0 && (
                <li className="text-emerald-700 dark:text-emerald-300">All checks passed.</li>
              )}
              {results.map((r) => (
                <li key={r.id} className="rounded-md border border-border p-2" data-testid={`check-${r.severity}`}>
                  <Badge className={r.severity === "blocker" ? "border-destructive/50 text-destructive" : ""}>
                    {r.severity}
                  </Badge>{" "}
                  <span className="font-mono text-xs">{r.rule_key}</span> {r.message}
                  {r.override_by && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Overridden by {name(r.override_by)}: {r.override_reason}
                    </div>
                  )}
                  {r.severity === "blocker" && !r.override_by && ctx.canOverride && (
                    <ActionForm action={overrideCheck} submitLabel="Override" className="mt-2 flex items-center gap-2">
                      <input type="hidden" name="org" value={slug} />
                      <input type="hidden" name="result_id" value={r.id} />
                      <Input
                        name="reason"
                        placeholder="Why this is OK (required)"
                        aria-label="Override reason"
                        className="h-8"
                        required
                        minLength={5}
                      />
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          <Card data-testid="approval-panel">
            <CardTitle className="mb-2">Decision</CardTitle>
            {approveBlocked ? (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled
                  className="h-8 rounded-md bg-primary px-3 text-xs text-primary-foreground opacity-50"
                >
                  Approve
                </button>
                <p className="text-xs text-muted-foreground" data-testid="approve-blocked">
                  {approveBlocked}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <ActionForm action={decide} submitLabel="Approve this version" className="space-y-2">
                  <input type="hidden" name="org" value={slug} />
                  <input type="hidden" name="subject_type" value="draft_version" />
                  <input type="hidden" name="subject_id" value={current!.id} />
                  <input type="hidden" name="decision" value="approved" />
                  <input type="hidden" name="warnings" value={warnings.length} />
                  {warnings.length > 0 && (
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" name="ack" /> I read the {warnings.length} warning(s)
                    </label>
                  )}
                </ActionForm>
                <ActionForm action={decide} submitLabel="Request changes" className="space-y-2">
                  <input type="hidden" name="org" value={slug} />
                  <input type="hidden" name="subject_type" value="draft_version" />
                  <input type="hidden" name="subject_id" value={current!.id} />
                  <input type="hidden" name="decision" value="changes_requested" />
                  <Input name="comment" placeholder="What needs to change" aria-label="What needs to change" required />
                </ActionForm>
              </div>
            )}
            <ul className="mt-3 space-y-1 text-xs" data-testid="approval-history">
              {approvals.map((a) => (
                <li key={a.id} className={a.stale ? "text-muted-foreground line-through" : ""}>
                  v{versions.find((v) => v.id === a.subject_id)?.version}: {a.decision.replace(/_/g, " ")} by{" "}
                  {name(a.approver_id)} ({a.approver_role}) · {when(a.decided_at)}
                  {a.comment ? ` · “${a.comment}”` : ""}
                  {a.stale ? " · stale" : ""}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      {editable && (
        <Card>
          <CardTitle>{current ? "Edit (saves a new version)" : "Write the first version"}</CardTitle>
          <CardDescription className="mb-3 mt-1">
            Every save is a new version with its own hash. Checks run on save. Editing after approval sends the job back
            to drafts.
          </CardDescription>
          <ActionForm
            action={saveDraftVersion}
            submitLabel="Save version"
            pendingLabel="Saving and checking…"
            className="space-y-3"
          >
            <input type="hidden" name="org" value={slug} />
            <input type="hidden" name="draft_id" value={draft.id} />
            {draft.kind === "listing" ? (
              <>
                <div className="space-y-1">
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" name="title" defaultValue={s(content.title)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bullets">Bullets (one per line)</Label>
                  <textarea
                    id="bullets"
                    name="bullets"
                    className={textarea}
                    defaultValue={Array.isArray(content.bullets) ? (content.bullets as string[]).join("\n") : ""}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="description">Description</Label>
                  <textarea
                    id="description"
                    name="description"
                    className={textarea}
                    defaultValue={s(content.description)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="backend_keywords">Backend keywords</Label>
                  <Input id="backend_keywords" name="backend_keywords" defaultValue={s(content.backend_keywords)} />
                </div>
              </>
            ) : (
              <>
                {draft.kind === "email" && (
                  <div className="space-y-1">
                    <Label htmlFor="subject">Subject</Label>
                    <Input id="subject" name="subject" defaultValue={s(content.subject)} />
                  </div>
                )}
                <div className="space-y-1">
                  <Label htmlFor="body">Text</Label>
                  <textarea id="body" name="body" className={textarea} defaultValue={s(content.body)} />
                </div>
                {draft.kind === "email" && (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="marketing" defaultChecked={content.marketing !== false} /> Marketing
                    email (CAN-SPAM rules apply)
                  </label>
                )}
                {draft.kind === "sms" && (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="first_message" defaultChecked={content.first_message !== false} />{" "}
                    First message to this number
                  </label>
                )}
              </>
            )}
            <div className="space-y-1">
              <Label htmlFor="substantiation">Substantiation / sources (optional)</Label>
              <Input
                id="substantiation"
                name="substantiation"
                defaultValue={s(content.substantiation)}
                placeholder="Where a claim, statistic or testimonial comes from"
              />
            </div>
          </ActionForm>
        </Card>
      )}

      <Card>
        <CardTitle className="mb-2">Versions</CardTitle>
        <ul className="space-y-1 text-xs" data-testid="versions">
          {versions.map((v) => (
            <li key={v.id}>
              v{v.version} · {v.author_kind === "user" ? name(v.author_id) : v.author_kind} · {when(v.created_at)} ·{" "}
              <span className="font-mono">#{v.content_hash.slice(0, 10)}</span>
              {v.id === draft.current_version_id ? " · current" : ""}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
