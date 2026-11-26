import { redirect } from "next/navigation";
import { getSessionState } from "@/server/auth/session";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { SignOutButton } from "@/components/sign-out-button";
import { EnrollForm, VerifyForm } from "./mfa-forms";

export default async function MfaPage() {
  const state = await getSessionState();
  if (state.status === "signed_out") redirect("/login");
  if (state.status === "ready") redirect("/");

  return (
    <main className="mx-auto mt-20 w-full max-w-sm px-4">
      <Card>
        {state.hasVerifiedFactor ? (
          <>
            <CardTitle className="text-lg">Two-step check</CardTitle>
            <CardDescription className="mb-5 mt-1">Enter the code from your authenticator app.</CardDescription>
            <VerifyForm />
          </>
        ) : (
          <>
            <CardTitle className="text-lg">Turn on two-step sign-in</CardTitle>
            <CardDescription className="mb-5 mt-1">
              Ops Hub requires an authenticator app for owners, admins and operators. This takes about a minute.
            </CardDescription>
            <EnrollForm />
          </>
        )}
        <div className="mt-6 border-t border-border pt-4">
          <SignOutButton />
        </div>
      </Card>
    </main>
  );
}
