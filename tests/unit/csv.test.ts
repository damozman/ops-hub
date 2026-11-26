import { describe, expect, it } from "vitest";
import { guessMapping, normalizePhone, parseCsv } from "@/lib/csv";

describe("parseCsv", () => {
  it("handles quotes, commas, escaped quotes and CRLF", () => {
    const rows = parseCsv('name,note\r\n"Doe, Jane","said ""hi"""\r\nBob,\r\n');
    expect(rows).toEqual([
      ["name", "note"],
      ["Doe, Jane", 'said "hi"'],
      ["Bob", ""],
    ]);
  });
  it("skips blank lines and a BOM", () => {
    expect(parseCsv("﻿a,b\n\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
  it("refuses very large files", () => {
    expect(() => parseCsv("a\n1\n2\n3", 2)).toThrow(/more than/);
  });
});

describe("normalizePhone", () => {
  it("normalizes US numbers", () => {
    expect(normalizePhone("(817) 555-0101")).toBe("+18175550101");
    expect(normalizePhone("1-817-555-0101")).toBe("+18175550101");
    expect(normalizePhone("+44 20 7946 0000")).toBe("+442079460000");
  });
  it("rejects junk", () => {
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});

describe("guessMapping", () => {
  it("maps common headers", () => {
    expect(guessMapping(["First Name", "E-mail", "Company_Name", "Fax"])).toEqual({
      "First Name": "first_name",
      "E-mail": "email",
      Company_Name: "company",
      Fax: "",
    });
  });
});
