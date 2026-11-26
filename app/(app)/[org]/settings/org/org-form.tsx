"use client";

import { useActionState } from "react";
import { saveOrgSettings, type FormState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { FormStatus } from "@/components/form-status";

type Props = {
  orgSlug: string;
  name: string;
  canRename: boolean;
  settings: { two_person_rule: boolean; operator_can_approve: boolean; operator_can_release: boolean };
};

const toggles = [
  {
    key: "two_person_rule",
    label: "Two-person rule",
    help: "The approver of a draft must be a different person from its last editor.",
  },
  {
    key: "operator_can_approve",
    label: "Operators can approve drafts",
    help: "Lets the operator role approve internal drafts.",
  },
  {
    key: "operator_can_release",
    label: "Operators can release the outbox",
    help: "Lets the operator role send approved items.",
  },
] as const;

export function OrgForm({ orgSlug, name, canRename, settings }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveOrgSettings, { status: "idle" });
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="org" value={orgSlug} />
      <div className="space-y-2">
        <Label htmlFor="name">Org name</Label>
        <Input id="name" name="name" defaultValue={name} readOnly={!canRename} required maxLength={120} />
        {!canRename && <p className="text-xs text-muted-foreground">Only the owner can rename the org.</p>}
      </div>
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Approval controls</legend>
        {toggles.map((t) => (
          <label key={t.key} className="flex items-start gap-3 text-sm">
            <input type="checkbox" name={t.key} defaultChecked={settings[t.key]} className="mt-1" />
            <span>
              <span className="font-medium">{t.label}</span>
              <span className="block text-muted-foreground">{t.help}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      <FormStatus state={state} />
    </form>
  );
}
