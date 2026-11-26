import Link from "next/link";
import { notFound } from "next/navigation";
import { jobsContext, STAGE_LABELS } from "@/server/jobs/context";
import { getGates, getJob, getJobDetail } from "@/server/jobs/queries";
import { Badge } from "@/components/ui/card";
import { StageGateBar } from "@/components/jobs/stage-gate-bar";
import { NotAllowed } from "../../not-allowed";
import { transitionJob } from "../actions";
import { JobsNav } from "../jobs-nav";
import { ActivityTab, AuditTab, DeliveryTab, DraftsTab, IntakeTab, OverviewTab, ReviewTab } from "./tabs";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "intake", label: "Intake" },
  { key: "audit", label: "Audit" },
  { key: "drafts", label: "Drafts" },
  { key: "review", label: "Review" },
  { key: "delivery", label: "Delivery" },
  { key: "activity", label: "Activity" },
] as const;

export default async function JobPage({ params, searchParams }: PageProps<"/[org]/jobs/[id]">) {
  const { org: slug, id } = await params;
  const { tab: tabParam } = await searchParams;
  const ctx = await jobsContext(slug);
  if (!ctx.canRead) return <NotAllowed what="jobs" />;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const job = await getJob(ctx.org.id, id);
  if (!job) notFound();
  const [gates, detail] = await Promise.all([getGates(id), getJobDetail(id)]);
  const tab = TABS.find((t) => t.key === tabParam)?.key ?? "overview";
  const props = { ctx, job, detail, slug };

  return (
    <div className="space-y-4">
      <JobsNav slug={slug} current="jobs" />
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold" data-testid="job-title">
          {job.title}
        </h1>
        <Badge data-testid="job-stage">{STAGE_LABELS[job.stage]}</Badge>
        <Badge>Offer {job.offer}</Badge>
        <span className="text-sm text-muted-foreground">
          {job.client_accounts?.companies?.name} · {job.brands?.name}
        </span>
      </div>
      {gates && <StageGateBar info={gates} slug={slug} jobId={job.id} action={transitionJob} />}
      <nav className="flex flex-wrap gap-1 border-b border-border text-sm" aria-label="Job sections">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/${slug}/jobs/${job.id}?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={
              tab === t.key
                ? "border-b-2 border-primary px-3 py-2 font-medium"
                : "px-3 py-2 text-muted-foreground hover:text-foreground"
            }
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "overview" && <OverviewTab {...props} />}
      {tab === "intake" && <IntakeTab {...props} />}
      {tab === "audit" && <AuditTab {...props} />}
      {tab === "drafts" && <DraftsTab {...props} />}
      {tab === "review" && <ReviewTab {...props} />}
      {tab === "delivery" && <DeliveryTab {...props} />}
      {tab === "activity" && <ActivityTab {...props} />}
    </div>
  );
}
