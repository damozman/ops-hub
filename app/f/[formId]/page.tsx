import { notFound } from "next/navigation";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/server/db/admin-client";
import { Card, CardDescription, CardTitle, Alert } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const ERRORS: Record<string, string> = {
  invalid: "Please give us a valid email or phone number.",
  spam: "Your submission was rejected.",
  rate_limited: "Too many submissions from your connection. Please try again in a minute.",
  error: "Something went wrong. Please try again.",
};

type PublicForm = {
  id: string;
  name: string;
  consent_text: string | null;
  brand_name: string;
  legal_footer: string | null;
};

export default async function PublicFormPage({ params, searchParams }: PageProps<"/f/[formId]">) {
  const { formId } = await params;
  const { sent, error } = await searchParams;
  if (!z.uuid().safeParse(formId).success) notFound();
  // public_form() returns only display fields of an active form.
  const { data } = await createSupabaseAdminClient().rpc("public_form", { p_form_id: formId });
  const form = data as PublicForm | null;
  if (!form) notFound();

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <Card>
        <CardTitle>{form.name}</CardTitle>
        <CardDescription className="mb-4 mt-1">{form.brand_name}</CardDescription>
        {sent ? (
          <Alert tone="success">Thanks. We got your request and will be in touch.</Alert>
        ) : (
          <form method="post" action={`/api/forms/${form.id}`} className="space-y-3">
            {typeof error === "string" && ERRORS[error] && <Alert tone="error">{ERRORS[error]}</Alert>}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="first_name" label="First name" />
              <Field id="last_name" label="Last name" />
              <Field id="email" label="Email" type="email" />
              <Field id="phone" label="Phone" type="tel" />
            </div>
            <Field id="company" label="Business name" />
            <div className="space-y-1">
              <Label htmlFor="message">How can we help?</Label>
              <textarea
                id="message"
                name="message"
                rows={4}
                maxLength={5000}
                className="w-full rounded-md border border-border bg-background p-2 text-sm"
              />
            </div>
            {/* Honeypot: hidden from people, filled by bots. */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label htmlFor="website_url">Leave this empty</label>
              <input id="website_url" name="website_url" type="text" tabIndex={-1} autoComplete="off" />
            </div>
            {form.consent_text && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="consent" className="mt-1" /> <span>{form.consent_text}</span>
              </label>
            )}
            <Button type="submit">Send</Button>
          </form>
        )}
        {form.legal_footer && <p className="mt-6 text-xs text-muted-foreground">{form.legal_footer}</p>}
      </Card>
    </main>
  );
}

function Field({ id, label, type = "text" }: { id: string; label: string; type?: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} type={type} />
    </div>
  );
}
