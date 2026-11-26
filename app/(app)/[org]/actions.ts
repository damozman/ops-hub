"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAppUser } from "@/server/auth/session";
import { getOrgBySlug, getVisibleBrands } from "@/server/permissions";
import { ALL_BRANDS, brandCookieName } from "@/lib/brand-selection";

const schema = z.object({ org: z.string().min(1), brand: z.string().min(1) });

export async function switchBrand(formData: FormData) {
  await requireAppUser();
  const { org: slug, brand } = schema.parse({ org: formData.get("org"), brand: formData.get("brand") });
  const org = await getOrgBySlug(slug);
  const visible = await getVisibleBrands(org.id);
  const allowed = brand === ALL_BRANDS ? visible.length > 1 : visible.some((b) => b.id === brand);
  if (!allowed) return;
  (await cookies()).set(brandCookieName(org.id), brand, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
  revalidatePath(`/${slug}`, "layout");
}
