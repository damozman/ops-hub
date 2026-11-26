import { describe, expect, it } from "vitest";
import { tzOffsetMinutes, zonedTimeToUtc } from "@/lib/time";

describe("Central time conversion", () => {
  it("uses CST (-06:00) in winter", () => {
    expect(zonedTimeToUtc("2026-01-15T10:00")?.toISOString()).toBe("2026-01-15T16:00:00.000Z");
  });
  it("uses CDT (-05:00) in summer, not a fixed -06:00", () => {
    expect(zonedTimeToUtc("2026-07-15T10:00")?.toISOString()).toBe("2026-07-15T15:00:00.000Z");
  });
  it("handles the days the clocks change", () => {
    expect(zonedTimeToUtc("2026-03-08T12:00")?.toISOString()).toBe("2026-03-08T17:00:00.000Z");
    expect(zonedTimeToUtc("2026-11-01T12:00")?.toISOString()).toBe("2026-11-01T18:00:00.000Z");
  });
  it("accepts a date alone (midnight) and rejects junk", () => {
    expect(zonedTimeToUtc("2026-07-15")?.toISOString()).toBe("2026-07-15T05:00:00.000Z");
    expect(zonedTimeToUtc("July 15")).toBeNull();
  });
  it("reports the offset", () => {
    expect(tzOffsetMinutes(new Date("2026-07-01T12:00:00Z"), "America/Chicago")).toBe(-300);
    expect(tzOffsetMinutes(new Date("2026-12-01T12:00:00Z"), "America/Chicago")).toBe(-360);
  });
});
