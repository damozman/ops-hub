import { Input, Label, Select } from "@/components/ui/input";

type Contact = {
  id?: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone_e164?: string | null;
  title?: string | null;
  company_id?: string | null;
  do_not_contact?: boolean;
};

export function ContactFields({
  orgSlug,
  companies,
  contact = {},
  disabled = false,
}: {
  orgSlug: string;
  companies: { id: string; name: string }[];
  contact?: Contact;
  disabled?: boolean;
}) {
  const p = contact.id ?? "new";
  const field = (name: keyof Contact, label: string, type = "text") => (
    <div className="space-y-1">
      <Label htmlFor={`${p}-${name}`}>{label}</Label>
      <Input
        id={`${p}-${name}`}
        name={name === "phone_e164" ? "phone" : name}
        type={type}
        defaultValue={(contact[name] as string | null | undefined) ?? ""}
      />
    </div>
  );
  return (
    <fieldset disabled={disabled} className="space-y-3">
      <input type="hidden" name="org" value={orgSlug} />
      {contact.id && <input type="hidden" name="id" value={contact.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        {field("first_name", "First name")}
        {field("last_name", "Last name")}
        {field("email", "Email", "email")}
        {field("phone_e164", "Phone", "tel")}
        {field("title", "Title")}
        <div className="space-y-1">
          <Label htmlFor={`${p}-company`}>Company</Label>
          <Select id={`${p}-company`} name="company_id" defaultValue={contact.company_id ?? ""}>
            <option value="">No company</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="do_not_contact" defaultChecked={contact.do_not_contact ?? false} /> Do not contact
      </label>
    </fieldset>
  );
}
