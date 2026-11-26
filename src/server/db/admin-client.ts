import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/db";
import { serverEnv } from "@/server/config/env";

/**
 * Service-role client. Bypasses RLS, so it is only for narrow server jobs
 * (sending invitations). Always check the caller's permission with the user
 * client first (BUILD_PLAN §5.4). Never import this from client code.
 */
export function createSupabaseAdminClient() {
  const env = serverEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
