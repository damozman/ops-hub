import { redirect } from "next/navigation";

export default async function CrmIndex({ params }: PageProps<"/[org]/crm">) {
  const { org } = await params;
  redirect(`/${org}/crm/deals`);
}
