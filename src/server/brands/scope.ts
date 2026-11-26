import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/server/db/server-client";

/** True when the signed-in user's membership covers every brand (same check as RLS: can_brand(org, null)). */
export const isAllBrands = cache(async (orgId: string) => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("can_brand", { p_org: orgId, p_brand: null as unknown as string });
  return !error && data === true;
});
