import Link from "next/link";
import { draftKindLabel, jobsContext } from "@/server/jobs/context";
import { reviewQueue } from "@/server/jobs/queries";
import { Badge, Card, CardTitle } from "@/components/ui/card";
import { NotAllowed } from "../not-allowed";
import { JobsNav } from "../jobs/jobs-nav";
import { OutboxList } from "../outbox/outbox-list";

export default async function ReviewQueuePage({ params }: PageProps<"/[org]/review-queue">) {
  const { org: slug } = await params;
  const ctx = await jobsContext(slug);
  if (!ctx.canRead) return <NotAllowed what="the review queue" />;
  const { drafts, outbox } = await reviewQueue(ctx.org.id, ctx.active);
  const me = ctx.session.userId;

  return (
    <div className="space-y-6">
      <JobsNav slug={slug} current="review" />
      <h1 className="text-xl font-semibold">Review queue</h1>
      <Card>
        <CardTitle className="mb-3">Drafts waiting for a decision ({drafts.length})</CardTitle>
        <ul className="divide-y divide-border text-sm" data-testid="review-drafts">
          {drafts.length === 0 && <li className="py-2 text-muted-foreground">Nothing to review.</li>}
          {drafts.map((d) => {
            const mine = d.draft_versions?.author_id === me;
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-2 py-2">
                <Link href={`/${slug}/jobs/${d.job_id}/drafts/${d.id}`} className="font-medium underline">
                  {d.title || draftKindLabel(d.kind)}
                </Link>
                <Badge>{draftKindLabel(d.kind)}</Badge>
                <span className="text-xs text-muted-foreground">{d.jobs?.title}</span>
                {mine && <Badge>you wrote this: someone else approves</Badge>}
              </li>
            );
          })}
        </ul>
      </Card>
      <Card>
        <CardTitle className="mb-3">Outbox items waiting for approval ({outbox.length})</CardTitle>
        <OutboxList ctx={ctx} slug={slug} items={outbox.map((o) => ({ ...o, brands: null }))} showJob />
      </Card>
    </div>
  );
}
