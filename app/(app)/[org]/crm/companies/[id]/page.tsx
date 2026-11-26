import Link from "next/link";
import { notFound } from "next/navigation";
import { crmContext, money } from "@/server/crm/context";
import { getCompany, listContacts, listDeals, listTasks } from "@/server/crm/queries";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, CardDescription, CardTitle } from "@/components/ui/card";
import { NotAllowed } from "../../../not-allowed";
import { saveCompany } from "../../actions";
import { CompanyFields } from "../../company-fields";
import { CrmNav } from "../../crm-nav";
import { RecordActivity } from "../../record-activity";

export default async function CompanyPage({ params }: PageProps<"/[org]/crm/companies/[id]">) {
  const { org: slug, id } = await params;
  const ctx = await crmContext(slug);
  if (!ctx.canRead) return <NotAllowed what="the CRM" />;
  const company = await getCompany(ctx.org.id, id);
  if (!company) notFound();
  const [contacts, deals, crossSell] = await Promise.all([
    listContacts(ctx.org.id, id),
    listDeals(ctx.org.id, { companyId: id }),
    listTasks(ctx.org.id, { subjectType: "company", subjectId: id }),
  ]);
  const suggestions = crossSell.filter((t) => t.title.toLowerCase().startsWith("cross-sell"));

  return (
    <div className="space-y-4">
      <CrmNav slug={slug} current="companies" />
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{company.name}</h1>
        <Badge>{company.lifecycle}</Badge>
      </div>

      {suggestions.length > 0 && (
        <Card data-testid="cross-sell">
          <CardTitle>Cross-sell suggestions</CardTitle>
          <CardDescription className="mb-2 mt-1">Created as tasks only. Nothing is sent to the client.</CardDescription>
          <ul className="list-disc pl-5 text-sm">
            {suggestions.map((t) => (
              <li key={t.id} className={t.status !== "open" ? "text-muted-foreground line-through" : ""}>
                {t.title}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle className="mb-3">Details</CardTitle>
          <ActionForm action={saveCompany} submitLabel="Save company">
            <CompanyFields
              orgSlug={slug}
              brands={ctx.brands}
              allBrands={ctx.allBrands}
              company={company}
              disabled={!ctx.canWrite}
            />
          </ActionForm>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardTitle className="mb-2">Contacts</CardTitle>
            <ul className="space-y-1 text-sm">
              {contacts.length === 0 && <li className="text-muted-foreground">No contacts.</li>}
              {contacts.map((c) => (
                <li key={c.id}>
                  <Link href={`/${slug}/crm/contacts/${c.id}`} className="hover:underline">
                    {[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email}
                  </Link>
                  {c.title ? <span className="text-muted-foreground"> · {c.title}</span> : null}
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardTitle className="mb-2">Deals</CardTitle>
            <ul className="space-y-1 text-sm">
              {deals.length === 0 && <li className="text-muted-foreground">No deals you can see.</li>}
              {deals.map((d) => (
                <li key={d.id}>
                  {d.title} · {money(d.value_cents)} · offer {d.offer} <Badge>{d.status}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <RecordActivity ctx={ctx} subject={{ type: "company", id }} />
    </div>
  );
}
