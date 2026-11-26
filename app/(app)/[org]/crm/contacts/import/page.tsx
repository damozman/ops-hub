import { crmContext } from "@/server/crm/context";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { NotAllowed } from "../../../not-allowed";
import { CrmNav } from "../../crm-nav";
import { ImportFlow } from "./import-flow";

export default async function ImportPage({ params }: PageProps<"/[org]/crm/contacts/import">) {
  const { org: slug } = await params;
  const ctx = await crmContext(slug);
  if (!ctx.canWrite) return <NotAllowed what="contact import" />;
  return (
    <div className="space-y-4">
      <CrmNav slug={slug} current="contacts" />
      <Card>
        <CardTitle>Import contacts from CSV</CardTitle>
        <CardDescription className="mb-4 mt-1">
          Rows that match an existing contact by email or phone are skipped. Files matching a protected client template
          (Settings, Import guard) are refused and never stored.
        </CardDescription>
        <ImportFlow orgSlug={slug} brands={ctx.brands} allBrands={ctx.allBrands} />
      </Card>
    </div>
  );
}
