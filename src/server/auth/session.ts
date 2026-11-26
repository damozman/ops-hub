import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/db/server-client";

export type SessionState =
  | { status: "signed_out" }
  | {
      status: "needs_mfa" | "ready";
      userId: string;
      email: string | null;
      hasVerifiedFactor: boolean;
    };

/**
 * Reads the signed-in user and their MFA state once per request.
 * MFA is required for owner/admin/operator (BUILD_PLAN §5.5), and for anyone
 * who has enrolled a factor. The database enforces the same rule in RLS.
 */
export const getSessionState = cache(async (): Promise<SessionState> => {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { status: "signed_out" };

  const [{ data: aal }, { data: requiresMfa }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.rpc("auth_requires_mfa"),
  ]);

  const hasVerifiedFactor = (user.factors ?? []).some((f) => f.status === "verified");
  const atAal2 = aal?.currentLevel === "aal2";
  const mfaNeeded = (requiresMfa === true || hasVerifiedFactor) && !atAal2;

  return {
    status: mfaNeeded ? "needs_mfa" : "ready",
    userId: user.id,
    email: user.email ?? null,
    hasVerifiedFactor,
  };
});

/** Use at the top of every internal page/layout/action. */
export async function requireAppUser() {
  const state = await getSessionState();
  if (state.status === "signed_out") redirect("/login");
  if (state.status === "needs_mfa") redirect("/mfa");
  return state;
}
