import Link from "next/link";
import type { JobsContext } from "@/server/jobs/context";
import { when } from "@/server/crm/context";
import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cancelOutbox, decide, releaseOutbox } from "../jobs/actions";

export type OutboxRow = {
  id: string;
  job_id: string | null;
  channel: string;
  recipient: string | null;
  subject: string | null;
  body: string;
  status: string;
  block_reason: string | null;
  content_hash: string;
  created_by: string | null;
  last_edited_by: string | null;
  sent_at: string | null;
  sent_by: string | null;
  created_at: string;
  jobs: { title: string } | null;
  brands: { name: string } | null;
};

/** OutboxItem list (BUILD_PLAN §6.2): exact content, its hash, and the actions this user may take. */
export function OutboxList({
  ctx,
  slug,
  items,
  showJob = false,
}: {
  ctx: JobsContext;
  slug: string;
  items: OutboxRow[];
  showJob?: boolean;
}) {
  const me = ctx.session.userId;
  const name = (id: string | null) => ctx.people.find((p) => p.id === id)?.name ?? "Someone";
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Nothing in the outbox.</p>;
  return (
    <ul className="space-y-3" data-testid="outbox-list">
      {items.map((o) => {
        const isAuthor = o.created_by === me || o.last_edited_by === me;
        return (
          <li key={o.id} className="rounded-md border border-border p-3 text-sm" data-testid="outbox-item">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{o.channel}</Badge>
              <Badge data-testid="outbox-status">{o.status.replace(/_/g, " ")}</Badge>
              {o.recipient && <span>to {o.recipient}</span>}
              {showJob && o.job_id && o.jobs && (
                <Link href={`/${slug}/jobs/${o.job_id}?tab=delivery`} className="text-xs underline">
                  {o.jobs.title}
                </Link>
              )}
              {o.brands && <span className="text-xs text-muted-foreground">{o.brands.name}</span>}
              <span className="ml-auto font-mono text-xs text-muted-foreground" title="Content hash">
                #{o.content_hash.slice(0, 10)}
              </span>
            </div>
            {o.subject && <div className="mt-1 font-medium">{o.subject}</div>}
            <p className="mt-1 whitespace-pre-wrap">{o.body}</p>
            <div className="mt-1 text-xs text-muted-foreground">
              Written by {name(o.last_edited_by ?? o.created_by)} · {when(o.created_at)}
              {o.sent_at ? ` · sent by ${name(o.sent_by)} ${when(o.sent_at)} (manual)` : ""}
              {o.block_reason ? ` · ${o.block_reason}` : ""}
            </div>
            <div className="mt-2 flex flex-wrap items-start gap-3">
              {o.status === "pending_approval" &&
                (!ctx.canApprove ? (
                  <span className="text-xs text-muted-foreground">Waiting for someone who can approve.</span>
                ) : isAuthor ? (
                  <span className="text-xs text-muted-foreground" data-testid="approve-disabled">
                    Two-person rule: someone other than the author approves this.
                  </span>
                ) : (
                  <ActionForm action={decide} submitLabel="Approve" className="flex items-center gap-2">
                    <input type="hidden" name="org" value={slug} />
                    <input type="hidden" name="subject_type" value="outbox_message" />
                    <input type="hidden" name="subject_id" value={o.id} />
                    <input type="hidden" name="decision" value="approved" />
                  </ActionForm>
                ))}
              {o.status === "approved" &&
                (ctx.canRelease ? (
                  <ActionForm
                    action={releaseOutbox}
                    submitLabel="I sent it: mark sent"
                    pendingLabel="Releasing…"
                    className="flex items-center gap-2"
                  >
                    <input type="hidden" name="org" value={slug} />
                    <input type="hidden" name="id" value={o.id} />
                  </ActionForm>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Approved. Waiting for someone who can release it.
                  </span>
                ))}
              {ctx.canWrite && !["sent", "cancelled"].includes(o.status) && (
                <ActionForm action={cancelOutbox} submitLabel="Cancel item" className="flex items-center gap-2">
                  <input type="hidden" name="org" value={slug} />
                  <input type="hidden" name="id" value={o.id} />
                  <Input
                    name="reason"
                    placeholder="Reason"
                    aria-label="Cancel reason"
                    className="h-8 max-w-48"
                    required
                  />
                </ActionForm>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
