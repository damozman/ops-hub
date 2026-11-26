import Link from "next/link";
import { crmContext } from "@/server/crm/context";
import { listCompanies, listContacts } from "@/server/crm/queries";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, CardTitle } from "@/components/ui/card";
import { NotAllowed } from "../../not-allowed";
import { saveContact } from "../actions";
import { ContactFields } from "../contact-fields";
import { CrmNav } from "../crm-nav";

export default async function ContactsPage({ params }: PageProps<"/[org]/crm/contacts">) {
  const { org: slug } = await params;
  const ctx = await crmContext(slug);
  if (!ctx.canRead) return <NotAllowed what="the CRM" />;
  const [contacts, companies] = await Promise.all([listContacts(ctx.org.id), listCompanies(ctx.org.id, null)]);

  return (
    <div className="space-y-4">
      <CrmNav slug={slug} current="contacts" />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Contacts</h1>
        {ctx.canWrite && (
          <Link href={`/${slug}/crm/contacts/import`} className="text-sm underline">
            Import CSV
          </Link>
        )}
      </div>
      <Card className="p-0">
        <table className="w-full text-sm" data-testid="contact-list">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Email</th>
              <th className="p-3">Phone</th>
              <th className="p-3">Company</th>
            </tr>
          </thead>
          <tbody>
            {contacts.length === 0 && (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={4}>
                  No contacts yet.
                </td>
              </tr>
            )}
            {contacts.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="p-3">
                  <Link href={`/${slug}/crm/contacts/${c.id}`} className="font-medium hover:underline">
                    {[c.first_name, c.last_name].filter(Boolean).join(" ") || "(no name)"}
                  </Link>
                  {c.do_not_contact && <Badge className="ml-2">do not contact</Badge>}
                </td>
                <td className="p-3">{c.email}</td>
                <td className="p-3">{c.phone_e164}</td>
                <td className="p-3 text-muted-foreground">{c.companies?.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {ctx.canWrite && (
        <Card>
          <CardTitle className="mb-3">Add a contact</CardTitle>
          <ActionForm action={saveContact} submitLabel="Create contact" resetOnOk>
            <ContactFields orgSlug={slug} companies={companies} brands={ctx.brands} allBrands={ctx.allBrands} />
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
