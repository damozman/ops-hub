import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/lib/env-schema";

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-anon-key-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-key-service-key-service",
  APP_BASE_URL: "http://127.0.0.1:3000",
  AUDIT_IP_HASH_SALT: "x".repeat(32),
};

describe("parseServerEnv", () => {
  it("applies defaults, including DEPLOY_MODE=cloud", () => {
    const env = parseServerEnv(valid);
    expect(env.DEPLOY_MODE).toBe("cloud");
    expect(env.MAILER_DRIVER).toBe("local");
    expect(env.APP_ENV).toBe("development");
  });
  it("accepts lan mode", () => {
    expect(parseServerEnv({ ...valid, DEPLOY_MODE: "lan" }).DEPLOY_MODE).toBe("lan");
  });
  it("rejects unknown deploy modes", () => {
    expect(() => parseServerEnv({ ...valid, DEPLOY_MODE: "edge" })).toThrow(/DEPLOY_MODE/);
  });
  it("names the missing variable without echoing values", () => {
    const { SUPABASE_SERVICE_ROLE_KEY: _omit, ...rest } = valid;
    void _omit;
    expect(() => parseServerEnv(rest)).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });
  it("requires a long audit salt", () => {
    expect(() => parseServerEnv({ ...valid, AUDIT_IP_HASH_SALT: "short" })).toThrow(/AUDIT_IP_HASH_SALT/);
  });
  it("refuses the local mail catcher in production", () => {
    expect(() => parseServerEnv({ ...valid, APP_ENV: "production" })).toThrow(/MAILER_DRIVER/);
  });
});
