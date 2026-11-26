"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { serverEnv } from "@/server/config/env";

export type LoginState = { status: "idle" | "sent" | "error"; message?: string };

const schema = z.object({ email: z.email().max(254) });

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: String(formData.get("email") ?? "")
      .trim()
      .toLowerCase(),
  });
  if (!parsed.success) return { status: "error", message: "Enter a valid email address." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      // Accounts are invite-only: never create a user from the login form.
      shouldCreateUser: false,
      emailRedirectTo: `${serverEnv().APP_BASE_URL}/auth/confirm`,
    },
  });

  if (error && error.status === 429) {
    return { status: "error", message: "Too many requests. Wait a minute and try again." };
  }
  // Same answer whether or not the address has an account (no account enumeration).
  return {
    status: "sent",
    message: "If that address has an Ops Hub account, a sign-in link is on its way. It expires in 15 minutes.",
  };
}
