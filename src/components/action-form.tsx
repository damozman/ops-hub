"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { FormStatus } from "@/components/form-status";

type State = { status: "idle" | "ok" | "error"; message?: string; id?: string };

/**
 * Wraps a server action so server-rendered fields can show pending and result
 * states. Fields are passed as children; the action re-checks everything.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel = "Saving…",
  resetOnOk = false,
  className = "space-y-3",
  testId,
}: {
  action: (prev: State, formData: FormData) => Promise<State>;
  children: React.ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  resetOnOk?: boolean;
  className?: string;
  testId?: string;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(action, { status: "idle" });
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnOk && state.status === "ok") ref.current?.reset();
  }, [state, resetOnOk]);
  return (
    <form ref={ref} action={formAction} className={className} data-testid={testId}>
      {children}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? pendingLabel : submitLabel}
      </Button>
      <FormStatus state={state} />
    </form>
  );
}
