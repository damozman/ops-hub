import "server-only";
import { cookies } from "next/headers";
import { brandCookieName, resolveActiveBrand } from "@/lib/brand-selection";
import { getVisibleBrands } from "@/server/permissions";

export async function getActiveBrand(orgId: string) {
  const brands = await getVisibleBrands(orgId);
  const store = await cookies();
  const active = resolveActiveBrand(
    store.get(brandCookieName(orgId))?.value,
    brands.map((b) => b.id),
  );
  return { brands, active };
}
