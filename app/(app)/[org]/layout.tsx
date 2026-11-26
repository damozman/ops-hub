import Link from "next/link";
import { requireAppUser } from "@/server/auth/session";
import { getOrgBySlug, hasPerm } from "@/server/permissions";
import { getActiveBrand } from "@/server/brands/active-brand";
import { SignOutButton } from "@/components/sign-out-button";
import { Badge } from "@/components/ui/card";
import { BrandSwitcher } from "./brand-switcher";

export default async function OrgLayout({ children, params }: LayoutProps<"/[org]">) {
  const session = await requireAppUser();
  const { org: slug } = await params;
  const org = await getOrgBySlug(slug);
  const [{ brands, active }, canManageMembers, canManageSettings] = await Promise.all([
    getActiveBrand(org.id),
    hasPerm(org.id, "members.manage"),
    hasPerm(org.id, "settings.manage"),
  ]);

  const nav = [
    { href: `/${slug}/dashboard`, label: "Dashboard", show: true },
    { href: `/${slug}/settings/org`, label: "Org settings", show: canManageSettings },
    { href: `/${slug}/settings/brands`, label: "Brands", show: true },
    { href: `/${slug}/settings/members`, label: "Members", show: canManageMembers },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <Link href={`/${slug}/dashboard`} className="font-semibold">
            Ops Hub
          </Link>
          <span className="text-sm text-muted-foreground">{org.name}</span>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <BrandSwitcher orgSlug={slug} brands={brands.map((b) => ({ id: b.id, name: b.name }))} active={active} />
            <span className="text-xs text-muted-foreground" data-testid="whoami">
              {session.email}
            </span>
            {org.role && <Badge data-testid="role">{org.role}</Badge>}
            <SignOutButton />
          </div>
        </div>
        <nav className="mx-auto flex w-full max-w-6xl gap-4 overflow-x-auto px-4 pb-2 text-sm">
          {nav
            .filter((n) => n.show)
            .map((n) => (
              <Link key={n.href} href={n.href} className="text-muted-foreground hover:text-foreground">
                {n.label}
              </Link>
            ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
