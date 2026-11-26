import { getOrgBySlug, getVisibleBrands, hasPerm } from "@/server/permissions";
import { Badge, Card, CardTitle } from "@/components/ui/card";
import { BrandForm } from "./brand-form";

export default async function BrandsPage({ params }: PageProps<"/[org]/settings/brands">) {
  const { org: slug } = await params;
  const org = await getOrgBySlug(slug);
  const [brands, canEdit] = await Promise.all([getVisibleBrands(org.id), hasPerm(org.id, "settings.manage")]);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Brands</h1>
      {brands.map((b) => (
        <Card key={b.id} data-testid="brand-settings">
          <CardTitle className="mb-3 flex items-center gap-2">
            {b.name} <Badge>{b.key}</Badge>
          </CardTitle>
          <BrandForm orgSlug={slug} brand={b} canEdit={canEdit} />
        </Card>
      ))}
    </div>
  );
}
