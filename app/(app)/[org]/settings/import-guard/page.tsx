import { getOrgBySlug, hasPerm } from "@/server/permissions";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { ActionForm } from "@/components/action-form";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NotAllowed } from "../../not-allowed";
import { deleteSignature, saveSignature } from "../crm-settings-actions";

export default async function ImportGuardSettings({ params }: PageProps<"/[org]/settings/import-guard">) {
  const { org: slug } = await params;
  const org = await getOrgBySlug(slug);
  if (!(await hasPerm(org.id, "settings.manage"))) return <NotAllowed what="import guard settings" />;
  const supabase = await createSupabaseServerClient();
  const { data: sigs } = await supabase
    .from("import_guard_signatures")
    .select("id, label, header_signature, threshold")
    .eq("org_id", org.id)
    .order("created_at");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Import guard</h1>
        <p className="text-sm text-muted-foreground">
          Uploads whose column headers match one of these templates are refused and logged, so client catalog files
          never enter Ops Hub.
        </p>
      </div>
      {(sigs ?? []).map((s) => (
        <Card key={s.id} data-testid="signature">
          <CardTitle>{s.label}</CardTitle>
          <CardDescription className="mt-1">
            Blocks a file containing at least {Math.round(Number(s.threshold) * 100)}% of these headers:
          </CardDescription>
          <p className="mt-2 break-words font-mono text-xs">{s.header_signature.join(", ")}</p>
          <form action={deleteSignature} className="mt-3">
            <input type="hidden" name="org" value={slug} />
            <input type="hidden" name="id" value={s.id} />
            <Button size="sm" variant="outline" type="submit">
              Remove
            </Button>
          </form>
        </Card>
      ))}
      <Card>
        <CardTitle className="mb-3">Add a template</CardTitle>
        <ActionForm action={saveSignature} submitLabel="Save template" resetOnOk>
          <input type="hidden" name="org" value={slug} />
          <div className="space-y-1">
            <Label htmlFor="sig-label">Label</Label>
            <Input id="sig-label" name="label" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sig-headers">Column headers (paste the header row, or one per line)</Label>
            <textarea
              id="sig-headers"
              name="headers"
              rows={4}
              required
              className="w-full rounded-md border border-border bg-background p-2 font-mono text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sig-threshold">Match threshold (0.5 to 1)</Label>
            <Input id="sig-threshold" name="threshold" type="number" min="0.5" max="1" step="0.05" defaultValue="0.8" />
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
