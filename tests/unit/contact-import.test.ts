import { describe, expect, it } from "vitest";
import { mapRows } from "@/lib/contact-import";

describe("mapRows", () => {
  it("maps columns to contact fields and drops ignored or empty cells", () => {
    const headers = ["First", "Email", "Notes", "Phone"];
    const mapping = { First: "first_name", Email: "email", Notes: "", Phone: "phone" } as const;
    expect(mapRows([["Ana", "ana@example.test", "skip me", ""]], headers, mapping)).toEqual([
      { first_name: "Ana", email: "ana@example.test" },
    ]);
  });
  it("keeps the first column when two map to the same field", () => {
    const headers = ["Email", "Work email"];
    const mapping = { Email: "email", "Work email": "email" } as const;
    expect(mapRows([["a@example.test", "b@example.test"]], headers, mapping)).toEqual([{ email: "a@example.test" }]);
  });
});
