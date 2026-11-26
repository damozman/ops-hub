import { getOrgBySlug } from "@/server/permissions";
import { getActiveBrand } from "@/server/brands/active-brand";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

export default async function Dashboard({ params }: PageProps<"/[org]/dashboard">) {
  const { org: slug } = await params;
  const org = await getOrgBySlug(slug);
  const { brands, active } = await getActiveBrand(org.id);
  const shown = active && active !== "all" ? brands.filter((b) => b.id === active) : brands;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Phase 0 foundation. CRM, jobs and review queues arrive in Phases 1 and 2.
        </p>
      </div>
      <section aria-label="Brands" className="grid gap-4 sm:grid-cols-2">
        {shown.map((b) => (
          <Card key={b.id} data-testid="brand-card">
            <CardTitle>{b.name}</CardTitle>
            <CardDescription className="mt-1">
              Key <code>{b.key}</code>
              {b.from_email ? ` · sends as ${b.from_email}` : ""}
            </CardDescription>
          </Card>
        ))}
      </section>
    </div>
  );
}
