import "server-only";
import { requireAppUser } from "@/server/auth/session";
import { getOrgBySlug, hasPerm } from "@/server/permissions";
import { getActiveBrand } from "@/server/brands/active-brand";
import { getOrgPeople } from "@/server/crm/queries";

/** Everything a CRM page needs: session, org (404 if not a member), permissions, brands and people. */
export async function crmContext(slug: string) {
  const session = await requireAppUser();
  const org = await getOrgBySlug(slug);
  const [canRead, canWrite, { brands, active }, people] = await Promise.all([
    hasPerm(org.id, "crm.read"),
    hasPerm(org.id, "crm.write"),
    getActiveBrand(org.id),
    getOrgPeople(org.id),
  ]);
  return { session, org, slug, canRead, canWrite, brands, active, people };
}

export type CrmContext = Awaited<ReturnType<typeof crmContext>>;

export function money(cents: number | null | undefined) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    (cents ?? 0) / 100,
  );
}

export function when(ts: string | null | undefined) {
  if (!ts) return "";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Chicago",
  }).format(new Date(ts));
}
