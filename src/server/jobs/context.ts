import "server-only";
import { requireAppUser } from "@/server/auth/session";
import { getOrgBySlug, hasPerm } from "@/server/permissions";
import { getActiveBrand } from "@/server/brands/active-brand";
import { getOrgPeople } from "@/server/crm/queries";
import { ALL_BRANDS } from "@/lib/brand-selection";

/** Everything a jobs page needs: session, org (404 if not a member), permissions, brands and people. */
export async function jobsContext(slug: string) {
  const session = await requireAppUser();
  const org = await getOrgBySlug(slug);
  const [
    canRead,
    canWrite,
    canTransition,
    canWriteDrafts,
    canApprove,
    canRelease,
    canOverride,
    canManageChecks,
    brandInfo,
    people,
  ] = await Promise.all([
    hasPerm(org.id, "jobs.read"),
    hasPerm(org.id, "jobs.write"),
    hasPerm(org.id, "jobs.transition"),
    hasPerm(org.id, "drafts.write"),
    hasPerm(org.id, "drafts.approve"),
    hasPerm(org.id, "outbox.release"),
    hasPerm(org.id, "checks.override"),
    hasPerm(org.id, "checks.manage"),
    getActiveBrand(org.id),
    getOrgPeople(org.id),
  ]);
  return {
    session,
    org,
    slug,
    canRead,
    canWrite,
    canTransition,
    canWriteDrafts,
    canApprove,
    canRelease,
    canOverride,
    canManageChecks,
    brands: brandInfo.brands,
    /** Active brand id, or null for "all brands". */
    active: brandInfo.active === ALL_BRANDS ? null : brandInfo.active,
    people,
  };
}

export type JobsContext = Awaited<ReturnType<typeof jobsContext>>;

export const STAGES = [
  "intake",
  "audit",
  "drafts",
  "review",
  "approved",
  "delivered",
  "upkeep",
  "closed",
  "cancelled",
] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<string, string> = {
  intake: "Intake",
  audit: "Audit",
  drafts: "Drafts",
  review: "Review",
  approved: "Approved",
  delivered: "Delivered",
  upkeep: "Upkeep",
  closed: "Closed",
  cancelled: "Cancelled",
};

export const DRAFT_KINDS = [
  { value: "listing", label: "Listing (title, bullets, description)" },
  { value: "gbp_description", label: "Google profile description" },
  { value: "gbp_post", label: "Google profile post" },
  { value: "review_reply", label: "Review reply" },
  { value: "review_request", label: "Review request" },
  { value: "sms", label: "SMS" },
  { value: "email", label: "Email" },
  { value: "other", label: "Other" },
] as const;

export const draftKindLabel = (k: string) => DRAFT_KINDS.find((d) => d.value === k)?.label.replace(/ \(.*\)$/, "") ?? k;
