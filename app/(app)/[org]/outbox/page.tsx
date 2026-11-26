import Link from "next/link";
import { jobsContext } from "@/server/jobs/context";
import { listOutbox } from "@/server/jobs/queries";
import { ActionForm } from "@/components/action-form";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { NotAllowed } from "../not-allowed";
import { saveOutbox } from "../jobs/actions";
import { JobsNav } from "../jobs/jobs-nav";
import { OutboxList } from "./outbox-list";

const STATUSES = ["pending_approval", "approved", "sent", "cancelled"];

export default async function OutboxPage({ params, searchParams }: PageProps<"/[org]/outbox">) {
  const { org: slug } = await params;
  const { status } = await searchParams;
  const ctx = await jobsContext(slug);
  if (!ctx.canRead) return <NotAllowed what="the outbox" />;
  const filter = typeof status === "string" && STATUSES.includes(status) ? status : null;
  const items = await listOutbox(ctx.org.id, ctx.active, filter);

  return (
    <div className="space-y-6">
      <JobsNav slug={slug} current="outbox" />
      <div>
        <h1 className="text-xl font-semibold">Outbox</h1>
        <p className="text-sm text-muted-foreground">
          Nothing leaves the app in Phases 0–2. Approved items are sent by hand, then marked sent here. Release is
          refused unless the approved content hash matches.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href={`/${slug}/outbox`} className={!filter ? "font-medium" : "text-muted-foreground"}>
          All
        </Link>
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/${slug}/outbox?status=${s}`}
            className={filter === s ? "font-medium" : "text-muted-foreground"}
          >
            {s.replace(/_/g, " ")}
          </Link>
        ))}
      </div>
      <Card>
        <OutboxList ctx={ctx} slug={slug} items={items} showJob />
      </Card>
      {ctx.canWrite && (
        <Card>
          <CardTitle>New outbox item</CardTitle>
          <CardDescription className="mb-3 mt-1">
            For messages not tied to a job. Job messages go on the job&apos;s Delivery tab.
          </CardDescription>
          <ActionForm action={saveOutbox} submitLabel="Add outbox item" resetOnOk className="space-y-2">
            <input type="hidden" name="org" value={slug} />
            <div className="grid gap-2 sm:grid-cols-4">
              <Select name="brand_id" aria-label="Outbox brand" defaultValue={ctx.active ?? undefined}>
                {ctx.brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
              <Select name="channel" aria-label="Channel" defaultValue="email">
                {["email", "sms", "gbp_post", "gbp_reply", "manual"].map((c) => (
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
              required
              className="flex min-h-20 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
