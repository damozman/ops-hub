import { describe, expect, it } from "vitest";
import { contentFields, wordDiff } from "@/lib/word-diff";

describe("wordDiff", () => {
  it("marks added and removed words", () => {
    expect(wordDiff("About 45 hours of burn time", "About 45 hours of clean burn time")).toEqual([
      { type: "same", text: "About 45 hours of " },
      { type: "added", text: "clean " },
      { type: "same", text: "burn time" },
    ]);
  });
  it("handles empty sides", () => {
    expect(wordDiff("", "new text")).toEqual([{ type: "added", text: "new text" }]);
    expect(wordDiff("old", "")).toEqual([{ type: "removed", text: "old" }]);
  });
  it("falls back for huge inputs", () => {
    expect(wordDiff("a b", "c d", 1)).toEqual([
      { type: "removed", text: "a b" },
      { type: "added", text: "c d" },
    ]);
  });
  it("round-trips: same + added = after, same + removed = before", () => {
    const before = "Hand-poured soy candle with a cotton wick";
    const after = "Hand-poured Texas soy candle with a wooden wick";
    const parts = wordDiff(before, after);
    expect(
      parts
        .filter((p) => p.type !== "removed")
        .map((p) => p.text)
        .join(""),
    ).toBe(after);
    expect(
      parts
        .filter((p) => p.type !== "added")
        .map((p) => p.text)
        .join(""),
    ).toBe(before);
  });
});

describe("contentFields", () => {
  it("flattens strings, string arrays and scalars", () => {
    expect(contentFields({ title: "T", bullets: ["a", "b"], size_oz: 8, nested: { x: 1 } })).toEqual({
      title: "T",
      bullets: "a\nb",
      size_oz: "8",
    });
  });
});
