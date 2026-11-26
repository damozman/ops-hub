// Canonical JSON + SHA-256, identical to public.canonical_json / canonical_hash in
// supabase/migrations/20261126020200_phase2_jobs_functions.sql (BUILD_PLAN §3.4).
//   objects: keys sorted by their UTF-8 bytes, no whitespace
//   arrays:  in order
//   strings: JSON escaping (same as Postgres: \" \\ \b \f \n \r \t, other controls as \u00xx)
//   numbers: shortest decimal form (1.50 -> 1.5, 2.0 -> 2). Keep numbers within ±1e21 and
//            avoid more than 15 significant digits so JavaScript and Postgres agree.
// A cross-check test compares both implementations (tests/e2e/canonical-hash.spec.ts).
import { createHash } from "node:crypto";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function compareUtf8(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

function numberText(n: number): string {
  if (!Number.isFinite(n)) throw new Error("canonicalJson: numbers must be finite");
  if (Object.is(n, -0)) return "0";
  const s = String(n);
  if (/e/i.test(s)) {
    // Expand exponent form the way Postgres numeric prints it (no exponent).
    return Number(n)
      .toFixed(20)
      .replace(/\.?0+$/, "");
  }
  return s;
}

export function canonicalJson(value: Json): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return numberText(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value)
    .filter((k) => value[k] !== undefined)
    .sort(compareUtf8);
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
}

export function canonicalHash(value: Json): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}
