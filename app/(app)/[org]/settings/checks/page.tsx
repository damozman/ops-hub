import { jobsContext } from "@/server/jobs/context";
import { listCheckRules } from "@/server/jobs/queries";
import { ActionForm } from "@/components/action-form";
import { Alert, Badge, Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Label, Select } from "@/components/ui/input";
import { NotAllowed } from "../../not-allowed";
import { saveRuleOverride } from "../../jobs/actions";

function hasVerify(params: unknown): boolean {
  return JSON.stringify(params ?? {}).includes('"verify":true');
}

export default async function ChecksSettingsPage({ params }: PageProps<"/[org]/settings/checks">) {
  const { org: slug } = await params;
  const ctx = await jobsContext(slug);
  if (!ctx.canRead) return <NotAllowed what="check rules" />;
  const rows = await listCheckRules(ctx.org.id);
  const globals = rows.filter((r) => r.org_id === null);
  const mine = new Map(rows.filter((r) => r.org_id !== null).map((r) => [r.rule_key, r]));
  const packs = [...new Set(globals.map((r) => r.pack))];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Checks</h1>
        <p className="text-sm text-muted-foreground">
          Rules run on every draft version. Blockers stop a job at G3; warnings need the approver to acknowledge them.
          Limits and word lists are data: change them here for this org.
        </p>
      </div>
      <Alert>
        Limits marked <Badge>verify</Badge> come from the build plan and must be checked against the current official
        style guide for the category before going live.
      </Alert>
      {packs.map((pack) => (
        <Card key={pack}>
          <CardTitle className="mb-3">{pack.replace(/^\d+_/, "").replace(/_/g, " ")}</CardTitle>
          <ul className="space-y-3">
            {globals
              .filter((g) => g.pack === pack)
              .map((g) => {
                const o = mine.get(g.rule_key);
                const eff = o ?? g;
                return (
                  <li
                    key={g.rule_key}
                    className="rounded-md border border-border p-3 text-sm"
                    data-testid={`rule-${g.rule_key}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{g.title}</span>
                      <span className="font-mono text-xs text-muted-foreground">{g.rule_key}</span>
                      <Badge>{eff.severity}</Badge>
                      {!eff.active && <Badge>off</Badge>}
                      {o && <Badge>org override v{o.version}</Badge>}
                      {hasVerify(eff.params) && <Badge className="border-amber-500/60">verify</Badge>}
                    </div>
                    {ctx.canManageChecks ? (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-muted-foreground">Edit for this org</summary>
                        <ActionForm action={saveRuleOverride} submitLabel="Save rule" className="mt-2 space-y-2">
                          <input type="hidden" name="org" value={slug} />
                          <input type="hidden" name="rule_key" value={g.rule_key} />
                          <div className="flex flex-wrap items-center gap-3">
                            <Label htmlFor={`sev-${g.rule_key}`}>Severity</Label>
                            <Select
                              id={`sev-${g.rule_key}`}
                              name="severity"
                              defaultValue={eff.severity}
                              className="w-32"
                            >
                              <option value="blocker">blocker</option>
                              <option value="warning">warning</option>
                              <option value="info">info</option>
                            </Select>
                            <label className="flex items-center gap-1 text-xs">
                              <input type="checkbox" name="active" defaultChecked={eff.active} /> Active
                            </label>
                          </div>
                          <textarea
                            name="params"
                            aria-label={`Parameters for ${g.rule_key}`}
                            defaultValue={JSON.stringify(eff.params, null, 2)}
                            className="min-h-32 w-full rounded-md border border-border bg-background p-2 font-mono text-xs"
                          />
                        </ActionForm>
                      </details>
                    ) : (
                      <CardDescription className="mt-1 text-xs">
                        Only owners and admins can change rules.
                      </CardDescription>
                    )}
                  </li>
                );
              })}
          </ul>
        </Card>
      ))}
    </div>
  );
}
