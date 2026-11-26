// Pure helpers for contact CSV import (unit-tested).
import { normalizePhone, type ContactField } from "@/lib/csv";

export type ImportRow = {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone_e164: string | null;
  title: string | null;
  company: string | null;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Maps CSV rows to contacts and dedupes by email or phone, both within the file
 * and against existing contacts. Rows with neither a valid email nor phone are skipped.
 */
export function planImport(
  rows: string[][],
  headers: string[],
  mapping: Record<string, ContactField | "">,
  existing: { email: string | null; phone_e164: string | null }[],
) {
  const seenEmail = new Set(existing.map((e) => e.email?.toLowerCase()).filter(Boolean) as string[]);
  const seenPhone = new Set(existing.map((e) => e.phone_e164).filter(Boolean) as string[]);
  const toInsert: ImportRow[] = [];
  let duplicates = 0;
  let invalid = 0;

  for (const r of rows) {
    const get = (f: ContactField) => {
      const i = headers.findIndex((h) => mapping[h] === f);
      const v = i >= 0 ? (r[i] ?? "").trim() : "";
      return v === "" ? null : v.slice(0, 254);
    };
    const rawEmail = get("email")?.toLowerCase() ?? null;
    const email = rawEmail && EMAIL.test(rawEmail) ? rawEmail : null;
    const phone = normalizePhone(get("phone"));
    if (!email && !phone) {
      invalid++;
      continue;
    }
    if ((email && seenEmail.has(email)) || (phone && seenPhone.has(phone))) {
      duplicates++;
      continue;
    }
    if (email) seenEmail.add(email);
    if (phone) seenPhone.add(phone);
    toInsert.push({
      first_name: get("first_name"),
      last_name: get("last_name"),
      email,
      phone_e164: phone,
      title: get("title"),
      company: get("company"),
    });
  }
  return { toInsert, duplicates, invalid };
}
