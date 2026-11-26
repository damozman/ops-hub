import Link from "next/link";
import { crmContext } from "@/server/crm/context";
import { listCompanies } from "@/server/crm/queries";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, CardTitle } from "@/components/ui/card";
import { NotAllowed } from "../../not-allowed";
import { saveCompany } from "../actions";
import { CompanyFields } from "../company-fields";
import { CrmNav } from "../crm-nav";

export default async function CompaniesPage({ params }: PageProps<"/[org]/crm/companies">) {
  const { org: slug } = await params;
  const ctx = await crmContext(slug);
  if (!ctx.canRead) return <NotAllowed what="the CRM" />;
  const companies = await listCompanies(ctx.org.id, ctx.active);
  const brandName = (id: string) => ctx.brands.find((b) => b.id === id)?.name ?? "";

  return (
    <div className="space-y-4">
      <CrmNav slug={slug} current="companies" />
      <h1 className="text-xl font-semibold">Companies</h1>
      <Card className="p-0">
        <table className="w-full text-sm" data-testid="company-list">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Location</th>
              <th className="p-3">Lifecycle</th>
              <th className="p-3">Brands</th>
            </tr>
          </thead>
          <tbody>
            {companies.length === 0 && (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={4}>
                  No companies yet.
                </td>
              </tr>
            )}
            {companies.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="p-3">
                  <Link href={`/${slug}/crm/companies/${c.id}`} className="font-medium hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td className="p-3">{[c.city, c.state].filter(Boolean).join(", ")}</td>
                <td className="p-3">
                  <Badge>{c.lifecycle}</Badge>
                </td>
                <td className="p-3 text-muted-foreground">
                  {c.brand_ids ? c.brand_ids.map(brandName).filter(Boolean).join(", ") : "Shared"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {ctx.canWrite && (
        <Card>
          <CardTitle className="mb-3">Add a company</CardTitle>
          <ActionForm action={saveCompany} submitLabel="Create company" resetOnOk>
            <CompanyFields orgSlug={slug} brands={ctx.brands} allBrands={ctx.allBrands} />
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
