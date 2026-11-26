"use client";

import { useActionState } from "react";
import { saveBrand, type FormState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { FormStatus } from "@/components/form-status";

type Brand = { id: string; key: string; name: string; from_email: string | null; legal_footer: string | null };

export function BrandForm({ orgSlug, brand, canEdit }: { orgSlug: string; brand: Brand; canEdit: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveBrand, { status: "idle" });
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="org" value={orgSlug} />
      <input type="hidden" name="id" value={brand.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`name-${brand.id}`}>Name</Label>
          <Input id={`name-${brand.id}`} name="name" defaultValue={brand.name} disabled={!canEdit} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`from-${brand.id}`}>From email</Label>
          <Input
            id={`from-${brand.id}`}
            name="from_email"
            type="email"
            defaultValue={brand.from_email ?? ""}
            disabled={!canEdit}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`footer-${brand.id}`}>Legal footer</Label>
        <Input
          id={`footer-${brand.id}`}
          name="legal_footer"
          defaultValue={brand.legal_footer ?? ""}
          disabled={!canEdit}
        />
      </div>
      {canEdit && (
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save brand"}
        </Button>
      )}
      <FormStatus state={state} />
    </form>
  );
}
