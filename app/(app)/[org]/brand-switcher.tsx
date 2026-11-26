"use client";

import { useRef } from "react";
import { switchBrand } from "./actions";
import { Select } from "@/components/ui/input";

export function BrandSwitcher({
  orgSlug,
  brands,
  active,
}: {
  orgSlug: string;
  brands: { id: string; name: string }[];
  active: string | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  if (brands.length === 0) return null;
  return (
    <form ref={formRef} action={switchBrand} className="flex items-center gap-2">
      <input type="hidden" name="org" value={orgSlug} />
      <label htmlFor="brand-switcher" className="text-xs text-muted-foreground">
        Brand
      </label>
      <Select
        id="brand-switcher"
        name="brand"
        defaultValue={active ?? undefined}
        className="h-8 w-48"
        onChange={() => formRef.current?.requestSubmit()}
      >
        {brands.length > 1 && <option value="all">All brands</option>}
        {brands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </Select>
    </form>
  );
}
