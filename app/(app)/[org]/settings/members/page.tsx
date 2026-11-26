import { getOrgBySlug, getVisibleBrands, hasPerm } from "@/server/permissions";
import { requireAppUser } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { NotAllowed } from "../../not-allowed";
import { InviteForm, MemberRow } from "./member-forms";

export default async function MembersPage({ params }: PageProps<"/[org]/settings/members">) {
  const session = await requireAppUser();
  const { org: slug } = await params;
  const org = await getOrgBySlug(slug);
  // Server check here, and RLS + the membership guard in the database.
  if (!(await hasPerm(org.id, "members.manage"))) return <NotAllowed what="members" />;

  const supabase = await createSupabaseServerClient();
  const [{ data: members }, { data: profiles }, brands, isOwner] = await Promise.all([
    supabase
      .from("memberships")
      .select("id, user_id, role, status, brand_ids")
      .eq("org_id", org.id)
      .order("created_at"),
    supabase.from("profiles").select("user_id, display_name"),
    getVisibleBrands(org.id),
    hasPerm(org.id, "org.manage"),
  ]);
  const nameOf = (id: string) => profiles?.find((p) => p.user_id === id)?.display_name ?? "Unknown user";
  const brandNames = (ids: string[] | null) =>
    ids ? ids.map((id) => brands.find((b) => b.id === id)?.name ?? "hidden brand").join(", ") : "All brands";

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Members</h1>
      <Card>
        <CardTitle>Invite someone</CardTitle>
        <CardDescription className="mb-4 mt-1">
          They get a sign-in link by email. Owners, admins and operators must set up an authenticator app.
        </CardDescription>
        <InviteForm orgSlug={slug} brands={brands.map((b) => ({ id: b.id, name: b.name }))} canInviteOwner={isOwner} />
      </Card>
      <Card>
        <CardTitle className="mb-2">People</CardTitle>
        <div data-testid="member-list">
          {(members ?? []).map((m) => (
            <MemberRow
              key={m.id}
              orgSlug={slug}
              canEditOwner={isOwner}
              isSelf={m.user_id === session.userId}
              member={{
                id: m.id,
                role: m.role,
                status: m.status,
                display_name: nameOf(m.user_id),
                brands: brandNames(m.brand_ids),
              }}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}
