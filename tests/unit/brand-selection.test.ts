import { describe, expect, it } from "vitest";
import { ALL_BRANDS, brandCookieName, resolveActiveBrand } from "@/lib/brand-selection";

const A = "20000000-0000-4000-8000-000000000001";
const B = "20000000-0000-4000-8000-000000000002";

describe("resolveActiveBrand", () => {
  it("returns null when the user can see no brands", () => {
    expect(resolveActiveBrand(A, [])).toBeNull();
  });
  it("keeps a cookie value the user can see", () => {
    expect(resolveActiveBrand(B, [A, B])).toBe(B);
  });
  it("ignores a cookie for a brand the user cannot see", () => {
    expect(resolveActiveBrand(A, [B])).toBe(B);
    expect(resolveActiveBrand("not-a-brand", [A, B])).toBe(ALL_BRANDS);
  });
  it("defaults to all brands, or the only brand", () => {
    expect(resolveActiveBrand(undefined, [A, B])).toBe(ALL_BRANDS);
    expect(resolveActiveBrand(undefined, [B])).toBe(B);
  });
  it("does not allow 'all' for a single-brand user", () => {
    expect(resolveActiveBrand(ALL_BRANDS, [B])).toBe(B);
  });
});

describe("brandCookieName", () => {
  it("is scoped per org", () => {
    expect(brandCookieName("10000000-0000-4000-8000-000000000001")).toBe("ops_brand_10000000000040008000000000000001");
  });
});
