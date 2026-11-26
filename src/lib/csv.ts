// Small RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). Pure and unit-tested.

export function parseCsv(text: string, maxRows = 5000): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      if (rows.length > maxRows) throw new Error(`CSV has more than ${maxRows - 1} data rows`);
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

/** US-centric E.164 normalization: 10 digits -> +1XXXXXXXXXX; keeps valid +E.164; else null. */
export function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^\+[1-9]\d{6,14}$/.test(trimmed.replace(/[\s().-]/g, ""))) return trimmed.replace(/[\s().-]/g, "");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export const CONTACT_FIELDS = ["first_name", "last_name", "email", "phone", "title", "company"] as const;
export type ContactField = (typeof CONTACT_FIELDS)[number];

/** Guesses a mapping from CSV headers to contact fields. */
export function guessMapping(headers: string[]): Record<string, ContactField | ""> {
  const aliases: Record<ContactField, string[]> = {
    first_name: ["first name", "first", "firstname", "given name"],
    last_name: ["last name", "last", "lastname", "surname", "family name"],
    email: ["email", "email address", "e mail"],
    phone: ["phone", "phone number", "mobile", "cell", "telephone"],
    title: ["title", "job title", "role"],
    company: ["company", "company name", "business", "organization", "organisation"],
  };
  const out: Record<string, ContactField | ""> = {};
  for (const h of headers) {
    const key = h.trim().toLowerCase().replace(/[_-]+/g, " ");
    out[h] = (Object.keys(aliases) as ContactField[]).find((f) => aliases[f].includes(key)) ?? "";
  }
  return out;
}
