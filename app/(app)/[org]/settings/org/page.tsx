import { getOrgBySlug, hasPerm } from "@/server/permissions";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { Card, CardTitle } from "@/components/ui/card";
import { NotAllowed } from "../../not-allowed";
import { OrgForm } from "./org-form";

export default async function OrgSettingsPage({ params }: PageProps<"/[org]/settings/org">) {
  const { org: slug } = await params;
  const org = await getOrgBySlug(slug);
  if (!(await hasPerm(org.id, "settings.manage"))) return <NotAllowed what="org settings" />;

  const supabase = await createSupabaseServerClient();
  const { data: rows } = await supabase.from("settings").select("key, value").eq("org_id", org.id);
  const get = (k: string, d: boolean) => {
    const v = rows?.find((r) => r.key === k)?.value;
    return typeof v === "boolean" ? v : d;
  };

  return (
    <Card className="max-w-xl">
      <CardTitle className="mb-4">Org settings</CardTitle>
      <OrgForm
        orgSlug={slug}
        name={org.name}
        canRename={await hasPerm(org.id, "org.manage")}
        settings={{
          two_person_rule: get("two_person_rule", true),
          operator_can_approve: get("operator_can_approve", true),
          operator_can_release: get("operator_can_release", false),
        }}
      />
    </Card>
  );
}
