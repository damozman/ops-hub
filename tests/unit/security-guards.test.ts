import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Grep-style guards from BUILD_PLAN §5.7 and §8 (security tests).

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".next", ".git", "test-results", "playwright-report"].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, exts));
    else if (exts.some((e) => p.endsWith(e))) out.push(p);
  }
  return out;
}

const migrations = walk("supabase/migrations", [".sql"]);
const appCode = [...walk("app", [".ts", ".tsx"]), ...walk("src", [".ts", ".tsx"]), "proxy.ts"];

describe("security guards", () => {
  it("has migrations to check", () => {
    expect(migrations.length).toBeGreaterThan(0);
  });

  it("no password column outside Supabase auth", () => {
    const offenders = migrations.filter((f) =>
      /\bpassword\w*\s+(text|varchar|character|bytea)/i.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("no NEXT_PUBLIC_ variable that looks like a secret", () => {
    const pattern = /NEXT_PUBLIC_\w*(SECRET|SERVICE_ROLE|PRIVATE|PEPPER|ENC_KEY|SALT|TOKEN)\w*/;
    const files = [...appCode, ".env.example"].filter((f) => pattern.test(readFileSync(f, "utf8")));
    expect(files).toEqual([]);
  });

  it("client components never import the service-role client or server modules", () => {
    const offenders = appCode.filter((f) => {
      const src = readFileSync(f, "utf8");
      return /^["']use client["']/m.test(src) && /@\/server\/(db|auth|config|audit|permissions)/.test(src);
    });
    expect(offenders).toEqual([]);
  });

  it("the service-role key is only read in the admin client and config", () => {
    const offenders = appCode.filter(
      (f) =>
        readFileSync(f, "utf8").includes("SUPABASE_SERVICE_ROLE_KEY") && !/admin-client\.ts$|env-schema\.ts$/.test(f),
    );
    expect(offenders).toEqual([]);
  });

  it("Phases 0-2 call no third-party APIs (no fetch to external hosts in app code)", () => {
    const offenders = appCode.filter((f) =>
      /fetch\(\s*["'`]https?:\/\/(?!127\.0\.0\.1|localhost)/.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("no code calls Cal.com or references the AAFES pipeline", () => {
    const offenders = [...appCode, ...migrations].filter((f) =>
      /https?:\/\/[^\s'"`]*cal\.com|aafes-pim-pipeline/i.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
