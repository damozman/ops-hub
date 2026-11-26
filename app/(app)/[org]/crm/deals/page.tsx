import { crmContext, money } from "@/server/crm/context";
import { listCompanies, listDeals, listPipelines } from "@/server/crm/queries";
import { ActionForm } from "@/components/action-form";
import { Card, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { NotAllowed } from "../../not-allowed";
import { createDeal } from "../actions";
import { CrmNav } from "../crm-nav";
import { DealBoard, DealsRealtime } from "./board";

export default async function DealsPage({ params }: PageProps<"/[org]/crm/deals">) {
  const { org: slug } = await params;
  const ctx = await crmContext(slug);
  if (!ctx.canRead) return <NotAllowed what="the CRM" />;
  const [pipelines, deals, companies] = await Promise.all([
    listPipelines(ctx.org.id, ctx.active),
    listDeals(ctx.org.id, { activeBrand: ctx.active }),
    listCompanies(ctx.org.id, ctx.active),
  ]);

  return (
    <div className="space-y-6">
      <CrmNav slug={slug} current="deals" />
      <DealsRealtime orgId={ctx.org.id} />
      <h1 className="text-xl font-semibold">Deals</h1>
      {pipelines.length === 0 && <p className="text-sm text-muted-foreground">No pipelines you can see.</p>}
      {pipelines.map((p) => (
        <DealBoard
          key={p.id}
          orgSlug={slug}
          pipelineName={`${p.brands?.name ?? ""} · ${p.name}`}
          stages={p.pipeline_stages.map((s) => ({ id: s.id, name: s.name, outcome: s.outcome }))}
          canWrite={ctx.canWrite}
          deals={deals
            .filter((d) => d.pipeline_id === p.id)
            .map((d) => ({
              id: d.id,
              title: d.title,
              value: money(d.value_cents),
              offer: d.offer,
              stage_id: d.stage_id,
              company: d.companies?.name ?? null,
              company_id: d.company_id,
            }))}
        />
      ))}

      {ctx.canWrite && pipelines.length > 0 && (
        <Card>
          <CardTitle className="mb-3">New deal</CardTitle>
          <ActionForm action={createDeal} submitLabel="Create deal" resetOnOk>
            <input type="hidden" name="org" value={slug} />
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="deal-title">Title</Label>
                <Input id="deal-title" name="title" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="deal-stage">Pipeline and stage</Label>
                <Select id="deal-stage" name="stage_id" required>
                  {pipelines.map((p) => (
                    <optgroup key={p.id} label={p.brands?.name ?? p.name}>
                      {p.pipeline_stages.map((s) => (
                        <option key={s.id} value={s.id} data-brand={p.brand_id}>
                          {p.brands?.name} · {s.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="deal-company">Company</Label>
                <Select id="deal-company" name="company_id" defaultValue="">
                  <option value="">No company</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="deal-value">Value (USD)</Label>
                <Input id="deal-value" name="value" type="number" min="0" step="1" defaultValue="0" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="deal-offer">Offer</Label>
                <Select id="deal-offer" name="offer" defaultValue="A">
                  <option value="A">A (listing optimization)</option>
                  <option value="B">B (local visibility)</option>
                  <option value="other">Other</option>
                </Select>
              </div>
            </div>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
