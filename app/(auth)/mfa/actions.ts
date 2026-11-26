"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { appAudit } from "@/server/audit";

export type EnrollState =
  | { status: "idle" }
  | { status: "enrolling"; factorId: string; qrCode: string; secret: string }
  | { status: "error"; message: string };

export type VerifyState = { status: "idle" | "error"; message?: string };

const codeSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app.");

export async function startEnrollment(): Promise<EnrollState> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  // Clear abandoned, unverified factors so enrollment can be retried.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Ops Hub ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error || !data) return { status: "error", message: "Could not start authenticator setup. Try again." };
  return { status: "enrolling", factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

async function verify(factorId: string, rawCode: string, isEnrollment: boolean): Promise<VerifyState> {
  const code = codeSchema.safeParse(rawCode.replace(/\s/g, ""));
  if (!code.success) return { status: "error", message: code.error.issues[0].message };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.data });
  if (error) return { status: "error", message: "That code didn't match. Check the time on your phone and try again." };

  const { data: user } = await supabase.auth.getUser();
  await appAudit({
    orgId: null,
    action: isEnrollment ? "app.mfa.enrolled" : "app.mfa.verified",
    subjectType: "auth_user",
    subjectId: user.user?.id ?? null,
  });
  redirect("/");
}

export async function confirmEnrollment(_prev: VerifyState, formData: FormData): Promise<VerifyState> {
  return verify(String(formData.get("factorId") ?? ""), String(formData.get("code") ?? ""), true);
}

export async function verifyExistingFactor(_prev: VerifyState, formData: FormData): Promise<VerifyState> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.mfa.listFactors();
  const factor = data?.totp?.[0];
  if (!factor) return { status: "error", message: "No authenticator is set up for this account." };
  return verify(factor.id, String(formData.get("code") ?? ""), false);
}
