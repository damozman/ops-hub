import { Input, Label, Select } from "@/components/ui/input";

type Company = {
  id?: string;
  name?: string;
  website?: string | null;
  industry?: string | null;
  street_address?: string | null;
  city?: string | null;
  state?: string | null;
  lifecycle?: string;
  sells_online?: boolean;
  brand_ids?: string[] | null;
};

/** Company form fields (used inside an ActionForm bound to saveCompany). */
export function CompanyFields({
  orgSlug,
  brands,
  company = {},
  disabled = false,
}: {
  orgSlug: string;
  brands: { id: string; name: string }[];
  company?: Company;
  disabled?: boolean;
}) {
  const p = company.id ?? "new";
  return (
    <fieldset disabled={disabled} className="space-y-3">
      <input type="hidden" name="org" value={orgSlug} />
      {company.id && <input type="hidden" name="id" value={company.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${p}-name`} label="Company name">
          <Input id={`${p}-name`} name="name" defaultValue={company.name ?? ""} required />
        </Field>
        <Field id={`${p}-website`} label="Website">
          <Input id={`${p}-website`} name="website" type="url" defaultValue={company.website ?? ""} />
        </Field>
        <Field id={`${p}-industry`} label="Industry">
          <Input id={`${p}-industry`} name="industry" defaultValue={company.industry ?? ""} />
        </Field>
        <Field id={`${p}-lifecycle`} label="Lifecycle">
          <Select id={`${p}-lifecycle`} name="lifecycle" defaultValue={company.lifecycle ?? "lead"}>
            {["lead", "prospect", "client", "churned"].map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={`${p}-street`} label="Street address">
          <Input id={`${p}-street`} name="street_address" defaultValue={company.street_address ?? ""} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id={`${p}-city`} label="City">
            <Input id={`${p}-city`} name="city" defaultValue={company.city ?? ""} />
          </Field>
          <Field id={`${p}-state`} label="State">
            <Input id={`${p}-state`} name="state" defaultValue={company.state ?? ""} />
          </Field>
        </div>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="sells_online" defaultChecked={company.sells_online ?? false} /> Sells online
        </label>
        {brands.map((b) => (
          <label key={b.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              name="brand_ids"
              value={b.id}
              defaultChecked={company.brand_ids?.includes(b.id) ?? false}
            />{" "}
            {b.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
