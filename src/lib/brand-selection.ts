// Pure helpers for the brand switcher (unit-tested).

export const ALL_BRANDS = "all";

export function brandCookieName(orgId: string) {
  return `ops_brand_${orgId.replace(/-/g, "")}`;
}

/**
 * Resolves the active brand from the cookie value. Only brands the user can
 * see (already filtered by RLS) are accepted; anything else falls back to
 * "all" when the user sees every brand, or to their first brand.
 */
export function resolveActiveBrand(
  cookieValue: string | undefined,
  visibleBrandIds: string[],
): string | typeof ALL_BRANDS | null {
  if (visibleBrandIds.length === 0) return null;
  if (cookieValue && visibleBrandIds.includes(cookieValue)) return cookieValue;
  if (visibleBrandIds.length === 1) return visibleBrandIds[0];
  return ALL_BRANDS;
}
