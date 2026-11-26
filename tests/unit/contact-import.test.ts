import { describe, expect, it } from "vitest";
import { planImport } from "@/lib/contact-import";

const headers = ["First", "Email", "Phone", "Company"];
const mapping = { First: "first_name", Email: "email", Phone: "phone", Company: "company" } as const;

describe("planImport", () => {
  it("dedupes by email and phone, within the file and against existing contacts", () => {
    const rows = [
      ["Ana", "ana@example.test", "", "Acme (fictional)"],
      ["Ana again", "ANA@example.test", "", ""],
      ["Bo", "", "(817) 555-0199", ""],
      ["Bo dup", "bo@example.test", "817-555-0199", ""],
      ["Existing", "dana@lonestar.example.test", "", ""],
      ["Nobody", "not-an-email", "", ""],
    ];
    const plan = planImport(rows, headers, mapping, [{ email: "dana@lonestar.example.test", phone_e164: null }]);
    expect(plan.toInsert.map((r) => r.first_name)).toEqual(["Ana", "Bo"]);
    expect(plan.toInsert[1].phone_e164).toBe("+18175550199");
    expect(plan.toInsert[0].company).toBe("Acme (fictional)");
    expect(plan.duplicates).toBe(3);
    expect(plan.invalid).toBe(1);
  });
});
