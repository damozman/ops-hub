import { jobsContext } from "@/server/jobs/context";
import { listClientAccounts } from "@/server/jobs/queries";
import { listCompanies, listContacts } from "@/server/crm/queries";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, CardTitle } from "@/components/ui/card";
import { Label, Select } from "@/components/ui/input";
import { NotAllowed } from "../../not-allowed";
import { createClientAccount } from "../actions";
import { JobsNav } from "../jobs-nav";

export default async function ClientAccountsPage({ params }: PageProps<"/[org]/jobs/clients">) {
  const { org: slug } = await params;
  const ctx = await jobsContext(slug);
  if (!ctx.canRead) return <NotAllowed what="client accounts" />;
  const [accounts, companies, contacts] = await Promise.all([
    listClientAccounts(ctx.org.id, ctx.active),
    ctx.canWrite ? listCompanies(ctx.org.id, null) : Promise.resolve([]),
    ctx.canWrite ? listContacts(ctx.org.id) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <JobsNav slug={slug} current="clients" />
      <h1 className="text-xl font-semibold">Client accounts</h1>
      <Card>
        <ul className="divide-y divide-border text-sm" data-testid="client-accounts">
          {accounts.length === 0 && <li className="py-2 text-muted-foreground">No client accounts yet.</li>}
          {accounts.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="font-medium">{a.companies?.name}</span>
              <Badge>{a.brands?.name}</Badge>
              <Badge>{a.status}</Badge>
              <Badge>{a.data_sensitivity === "client_confidential" ? "client confidential" : "public data only"}</Badge>
              {a.ai_policy === "local_only" && <Badge>local AI only</Badge>}
              {a.contacts && (
                <span className="text-xs text-muted-foreground">
                  Owner contact: {[a.contacts.first_name, a.contacts.last_name].filter(Boolean).join(" ")}
                </span>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {ctx.canWrite && (
        <Card>
          <CardTitle className="mb-3">New client account</CardTitle>
          <ActionForm
            action={createClientAccount}
            submitLabel="Create client account"
            className="grid gap-3 sm:grid-cols-2"
          >
            <input type="hidden" name="org" value={slug} />
            <div className="space-y-1">
              <Label htmlFor="brand_id">Brand</Label>
              <Select id="brand_id" name="brand_id" defaultValue={ctx.active ?? undefined} required>
                {ctx.brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="company_id">Company</Label>
              <Select id="company_id" name="company_id" required>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="primary_contact_id">Owner contact</Label>
              <Select id="primary_contact_id" name="primary_contact_id">
                <option value="">None yet</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="data_sensitivity">Data sensitivity</Label>
              <Select id="data_sensitivity" name="data_sensitivity">
                <option value="public_only">Public data only</option>
                <option value="client_confidential">Client confidential</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ai_policy">AI policy</Label>
              <Select id="ai_policy" name="ai_policy">
                <option value="default">Default</option>
                <option value="local_only">Local AI only</option>
              </Select>
            </div>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
