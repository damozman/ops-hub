import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/server/db/server-client", () => ({ createSupabaseServerClient: vi.fn() }));

describe("hashIp", async () => {
  const { hashIp } = await import("@/server/audit");
  it("is deterministic per salt and never returns the raw IP", () => {
    const a = hashIp("203.0.113.7", "s".repeat(32));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(hashIp("203.0.113.7", "s".repeat(32)));
    expect(a).not.toBe(hashIp("203.0.113.7", "t".repeat(32)));
    expect(a).not.toContain("203.0.113.7");
  });
  it("returns null with no IP", () => {
    expect(hashIp(null, "s".repeat(32))).toBeNull();
  });
});
