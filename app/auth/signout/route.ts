import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { serverEnv } from "@/server/config/env";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", serverEnv().APP_BASE_URL), { status: 303 });
}
