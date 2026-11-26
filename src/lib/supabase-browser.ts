"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/db";

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

/** Browser client with the public anon key; every read still goes through RLS as the signed-in user. */
export function supabaseBrowser() {
  client ??= createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return client;
}
