"use client";

import { useActionState, useState, useTransition } from "react";
import {
  confirmEnrollment,
  startEnrollment,
  verifyExistingFactor,
  type EnrollState,
  type VerifyState,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/card";

function CodeField() {
  return (
    <div className="space-y-2">
      <Label htmlFor="code">6-digit code</Label>
      <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required />
    </div>
  );
}

export function EnrollForm() {
  const [enroll, setEnroll] = useState<EnrollState>({ status: "idle" });
  const [starting, startTransition] = useTransition();
  const [state, action, pending] = useActionState<VerifyState, FormData>(confirmEnrollment, { status: "idle" });

  if (enroll.status !== "enrolling") {
    return (
      <div className="space-y-3">
        <Button disabled={starting} onClick={() => startTransition(async () => setEnroll(await startEnrollment()))}>
          {starting ? "Preparing…" : "Set up authenticator app"}
        </Button>
        {enroll.status === "error" && <Alert tone="error">{enroll.message}</Alert>}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <p className="text-sm">Scan this code with Google Authenticator, 1Password, Authy or similar.</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- data: URL SVG from Supabase */}
      <img src={enroll.qrCode} alt="Authenticator QR code" className="h-44 w-44 rounded bg-white p-2" />
      <p className="text-xs text-muted-foreground">
        Can&apos;t scan? Enter this key:{" "}
        <code data-testid="totp-secret" className="break-all font-mono">
          {enroll.secret}
        </code>
      </p>
      <input type="hidden" name="factorId" value={enroll.factorId} />
      <CodeField />
      <Button type="submit" disabled={pending}>
        {pending ? "Checking…" : "Verify and continue"}
      </Button>
      {state.status === "error" && <Alert tone="error">{state.message}</Alert>}
    </form>
  );
}

export function VerifyForm() {
  const [state, action, pending] = useActionState<VerifyState, FormData>(verifyExistingFactor, { status: "idle" });
  return (
    <form action={action} className="space-y-4">
      <CodeField />
      <Button type="submit" disabled={pending}>
        {pending ? "Checking…" : "Continue"}
      </Button>
      {state.status === "error" && <Alert tone="error">{state.message}</Alert>}
    </form>
  );
}
