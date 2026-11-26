import { describe, expect, it } from "vitest";
import { extractMentions } from "@/lib/mentions";

const people = [
  { id: "a", name: "Chris" },
  { id: "b", name: "Chris (dev)" },
  { id: "c", name: "Partner (dev)" },
];

describe("extractMentions", () => {
  it("finds mentions case-insensitively", () => {
    expect(extractMentions("hey @partner (dev) can you call?", people)).toEqual(["c"]);
  });
  it("prefers the longest name", () => {
    expect(extractMentions("@Chris (dev) please review", people)).toEqual(["b"]);
  });
  it("ignores names that run into other characters", () => {
    expect(extractMentions("email@Christopher.test", people)).toEqual([]);
  });
  it("returns each person once", () => {
    expect(extractMentions("@Chris and again @Chris", people)).toEqual(["a"]);
  });
  it("returns nothing without an @", () => {
    expect(extractMentions("Chris said hi", people)).toEqual([]);
  });
});
