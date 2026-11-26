import "server-only";
import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/db";

/**
 * Supabase client acting as the signed-in user. Every query runs under RLS.
 * Use this for all reads and writes that come from a user request.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const requestId = (await headers()).get("x-request-id");
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // PostgREST exposes request headers to SQL; audit_row() records this id.
      global: { headers: requestId ? { "x-request-id": requestId } : {} },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component render; proxy.ts refreshes the session instead.
          }
        },
      },
    },
  );
}
