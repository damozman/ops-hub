import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { canonicalHash, canonicalJson } from "@/lib/canonical-hash";

describe("canonicalJson", () => {
  it("sorts keys, drops whitespace and trims numbers", () => {
    expect(canonicalJson({ b: 1, a: [1.5, "x\n", true, null, { z: 2.0, y: {} }] })).toBe(
      '{"a":[1.5,"x\\n",true,null,{"y":{},"z":2}],"b":1}',
    );
  });
  it("matches the Postgres test vector in 09_jobs_gates", () => {
    expect(canonicalHash({ a: 1 })).toBe(createHash("sha256").update('{"a":1}').digest("hex"));
  });
  it("sorts keys by UTF-8 bytes", () => {
    expect(canonicalJson({ é: 1, z: 2, Z: 3 })).toBe('{"Z":3,"z":2,"é":1}');
  });
  it("is independent of key order", () => {
    expect(canonicalHash({ x: [1, { b: 2, a: 1 }], y: "s" })).toBe(canonicalHash({ y: "s", x: [1, { a: 1, b: 2 }] }));
  });
  it("expands exponent numbers like Postgres numeric", () => {
    expect(canonicalJson(1e-7)).toBe("0.0000001");
    expect(canonicalJson(1e20)).toBe("100000000000000000000");
  });
});
