"use client";

import { useActionState } from "react";
import { inviteMember, updateMember, type FormState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { FormStatus } from "@/components/form-status";

const ROLE_HELP: Record<string, string> = {
  owner: "Everything, including billing and owners",
  admin: "Everything except billing and owners",
  operator: "Day-to-day work; no members or settings",
  reviewer: "Reads CRM and approves drafts",
  viewer: "Read only",
};

export function InviteForm({
  orgSlug,
  brands,
  canInviteOwner,
  brandLimited = false,
}: {
  orgSlug: string;
  brands: { id: string; name: string }[];
  canInviteOwner: boolean;
  brandLimited?: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(inviteMember, { status: "idle" });
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="org" value={orgSlug} />
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div className="space-y-1">
          <Label htmlFor="invite-email">Email</Label>
          <Input id="invite-email" name="email" type="email" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="invite-role">Role</Label>
          <Select id="invite-role" name="role" defaultValue="operator">
            {Object.keys(ROLE_HELP)
              .filter((r) => r !== "owner" || canInviteOwner)
              .map((r) => (
                <option key={r} value={r}>
                  {r} — {ROLE_HELP[r]}
                </option>
              ))}
          </Select>
        </div>
      </div>
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">
          {brandLimited ? "Brands (pick at least one of yours)" : "Brands (leave all unticked for every brand)"}
        </legend>
        <div className="flex flex-wrap gap-4">
          {brands.map((b) => (
            <label key={b.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="brand_ids" value={b.id} /> {b.name}
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit" disabled={pending}>
        {pending ? "Inviting…" : "Send invitation"}
      </Button>
      <FormStatus state={state} />
    </form>
  );
}

export function MemberRow({
  orgSlug,
  member,
  canEditOwner,
  isSelf,
  outOfScope = false,
}: {
  orgSlug: string;
  member: { id: string; role: string; status: string; display_name: string; brands: string };
  canEditOwner: boolean;
  isSelf: boolean;
  outOfScope?: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateMember, { status: "idle" });
  // Your own role/brands are changed by another manager (enforced in the database too).
  // Members with brands outside a brand-limited manager's own are locked the same way.
  const locked = isSelf || outOfScope || (member.role === "owner" && !canEditOwner);
  return (
    <form
      action={action}
      className="grid items-center gap-2 border-b border-border py-3 text-sm sm:grid-cols-[2fr_1fr_1fr_1fr_auto]"
    >
      <input type="hidden" name="org" value={orgSlug} />
      <input type="hidden" name="id" value={member.id} />
      <div>
        <div className="font-medium">{member.display_name}</div>
        <div className="text-xs text-muted-foreground">
          {member.brands}
          {isSelf ? " · you" : ""}
          {!isSelf && outOfScope ? " · outside your brands" : ""}
        </div>
      </div>
      <Select name="role" defaultValue={member.role} disabled={locked} aria-label="Role">
        {["owner", "admin", "operator", "reviewer", "viewer", "client"].map((r) => (
          <option key={r} value={r} disabled={r === "owner" && !canEditOwner}>
            {r}
          </option>
        ))}
      </Select>
      <Select name="status" defaultValue={member.status} disabled={locked} aria-label="Status">
        {["active", "invited", "disabled"].map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>
      <Button type="submit" size="sm" variant="outline" disabled={pending || locked}>
        Save
      </Button>
      <div className="sm:col-span-5">
        <FormStatus state={state} />
      </div>
    </form>
  );
}
