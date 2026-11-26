import Link from "next/link";
import { notFound } from "next/navigation";
import { crmContext, when } from "@/server/crm/context";
import { getContact, listCompanies } from "@/server/crm/queries";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { NotAllowed } from "../../../not-allowed";
import { addBookingLink, saveContact } from "../../actions";
import { ContactFields } from "../../contact-fields";
import { CrmNav } from "../../crm-nav";
import { RecordActivity } from "../../record-activity";

export default async function ContactPage({ params }: PageProps<"/[org]/crm/contacts/[id]">) {
  const { org: slug, id } = await params;
  const ctx = await crmContext(slug);
  if (!ctx.canRead) return <NotAllowed what="the CRM" />;
  const contact = await getContact(ctx.org.id, id);
  if (!contact) notFound();
  const supabase = await createSupabaseServerClient();
  const [companies, { data: bookings }, { data: consents }] = await Promise.all([
    listCompanies(ctx.org.id, null),
    supabase
      .from("bookings")
      .select("id, booking_url, starts_at, status, notes")
      .eq("org_id", ctx.org.id)
      .eq("contact_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("consents")
      .select("id, channel, purpose, status, consent_text_version, captured_at")
      .eq("org_id", ctx.org.id)
      .eq("contact_id", id)
      .order("captured_at", { ascending: false }),
  ]);
  const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.email || "Contact";

  return (
    <div className="space-y-4">
      <CrmNav slug={slug} current="contacts" />
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{name}</h1>
        {contact.companies && (
          <Link href={`/${slug}/crm/companies/${contact.companies.id}`} className="text-sm underline">
            {contact.companies.name}
          </Link>
        )}
        {contact.do_not_contact && <Badge>do not contact</Badge>}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle className="mb-3">Details</CardTitle>
          <ActionForm action={saveContact} submitLabel="Save contact">
            <ContactFields
              orgSlug={slug}
              companies={companies}
              brands={ctx.brands}
              contact={contact}
              disabled={!ctx.canWrite}
            />
          </ActionForm>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardTitle>Bookings</CardTitle>
            <CardDescription className="mb-3 mt-1">
              Paste the booking link from your scheduling page. Ops Hub stores the link only.
            </CardDescription>
            <ul className="mb-3 space-y-1 text-sm" data-testid="bookings">
              {(bookings ?? []).map((b) => (
                <li key={b.id}>
                  <a href={b.booking_url ?? "#"} target="_blank" rel="noreferrer noopener" className="underline">
                    Booking link
                  </a>
                  {b.starts_at ? ` · ${when(b.starts_at)}` : ""} · {b.status}
                  {b.notes ? <span className="block text-xs text-muted-foreground">{b.notes}</span> : null}
                </li>
              ))}
            </ul>
            {ctx.canWrite && (
              <ActionForm action={addBookingLink} submitLabel="Save booking" resetOnOk className="space-y-2">
                <input type="hidden" name="org" value={slug} />
                <input type="hidden" name="contact_id" value={id} />
                <Label htmlFor="booking-url">Booking link (https://)</Label>
                <Input id="booking-url" name="booking_url" type="url" required />
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input name="starts_at" type="datetime-local" aria-label="Starts at" />
                  <Input name="notes" aria-label="Notes" placeholder="Notes" />
                </div>
              </ActionForm>
            )}
          </Card>
          <Card>
            <CardTitle className="mb-2">Consent</CardTitle>
            <ul className="space-y-1 text-sm" data-testid="consents">
              {(consents ?? []).length === 0 && <li className="text-muted-foreground">No consent recorded.</li>}
              {(consents ?? []).map((c) => (
                <li key={c.id}>
                  {c.channel} · {c.purpose} · {c.status} · text {c.consent_text_version} · {when(c.captured_at)}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
      <RecordActivity ctx={ctx} subject={{ type: "contact", id }} />
    </div>
  );
}
