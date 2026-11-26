import { getOrgBySlug, getVisibleBrands, hasPerm } from "@/server/permissions";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { serverEnv } from "@/server/config/env";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NotAllowed } from "../../not-allowed";
import { saveForm, setFormActive } from "../crm-settings-actions";

export default async function FormsSettings({ params }: PageProps<"/[org]/settings/forms">) {
  const { org: slug } = await params;
  const org = await getOrgBySlug(slug);
  if (!(await hasPerm(org.id, "settings.manage"))) return <NotAllowed what="form settings" />;
  const supabase = await createSupabaseServerClient();
  const [{ data: forms }, brands] = await Promise.all([
    supabase
      .from("forms")
      .select("id, name, brand_id, consent_text_version, redirect_url, active")
      .eq("org_id", org.id)
      .order("created_at"),
    getVisibleBrands(org.id),
  ]);
  const base = serverEnv().APP_BASE_URL;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Lead forms</h1>
      {(forms ?? []).map((f) => {
        const url = `${base}/f/${f.id}`;
        return (
          <Card key={f.id} data-testid="form-card">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>{f.name}</CardTitle>
              <Badge>{brands.find((b) => b.id === f.brand_id)?.name}</Badge>
              <Badge>{f.active ? "active" : "paused"}</Badge>
              {f.consent_text_version && <Badge>consent {f.consent_text_version}</Badge>}
            </div>
            <CardDescription className="mb-2 mt-2">
              Public link:{" "}
              <a href={url} className="underline" target="_blank" rel="noreferrer">
                {url}
              </a>
            </CardDescription>
            <Label>Embed snippet</Label>
            <pre className="mt-1 overflow-x-auto rounded-md bg-muted p-2 text-xs">
              {`<iframe src="${url}" title="${f.name.replace(/"/g, "")}" style="width:100%;min-height:640px;border:0"></iframe>`}
            </pre>
            <form action={setFormActive} className="mt-3">
              <input type="hidden" name="org" value={slug} />
              <input type="hidden" name="id" value={f.id} />
              <input type="hidden" name="active" value={f.active ? "false" : "true"} />
              <Button size="sm" variant="outline" type="submit">
                {f.active ? "Pause form" : "Turn form on"}
              </Button>
            </form>
          </Card>
        );
      })}
      <Card>
        <CardTitle className="mb-3">New form</CardTitle>
        <ActionForm action={saveForm} submitLabel="Create form" resetOnOk>
          <input type="hidden" name="org" value={slug} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="form-name">Name</Label>
              <Input id="form-name" name="name" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="form-brand">Brand</Label>
              <Select id="form-brand" name="brand_id">
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="form-consent">Consent checkbox text (leave empty for no consent checkbox)</Label>
            <textarea
              id="form-consent"
              name="consent_text"
              rows={2}
              className="w-full rounded-md border border-border bg-background p-2 text-sm"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="form-consent-version">Consent text version</Label>
              <Input id="form-consent-version" name="consent_text_version" placeholder="fpd-2026-11-v2" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="form-redirect">Thank-you page (https://, optional)</Label>
              <Input id="form-redirect" name="redirect_url" type="url" />
            </div>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
