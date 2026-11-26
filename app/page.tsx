import { redirect } from "next/navigation";
import { requireAppUser } from "@/server/auth/session";
import { getMyOrgs } from "@/server/permissions";

export default async function Home() {
  await requireAppUser();
  const orgs = await getMyOrgs();
  if (orgs.length === 0) redirect("/no-access");
  redirect(`/${orgs[0].slug}/dashboard`);
}
