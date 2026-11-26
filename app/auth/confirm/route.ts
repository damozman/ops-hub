import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { serverEnv } from "@/server/config/env";

// Landing point for magic links and invitations.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  // Redirect to the configured app URL, not the request's Host header.
  const base = serverEnv().APP_BASE_URL;
  const supabase = await createSupabaseServerClient();

  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  }
  if (!ok) return NextResponse.redirect(new URL("/auth/error", base));

  // First sign-in after an invitation activates the membership.
  await supabase.rpc("accept_my_invites");
  return NextResponse.redirect(new URL("/mfa", base));
}
