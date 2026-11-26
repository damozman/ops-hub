// Pure helper for contact CSV import (unit-tested). Dedupe happens in the
// database (public.import_contacts), so nothing here depends on what RLS shows.
import type { ContactField } from "@/lib/csv";

export type MappedRow = Partial<Record<ContactField, string>>;

/** Maps CSV rows to contact fields using the chosen column mapping. Empty cells are left out. */
export function mapRows(rows: string[][], headers: string[], mapping: Record<string, ContactField | "">): MappedRow[] {
  return rows.map((r) => {
    const out: MappedRow = {};
    headers.forEach((h, i) => {
      const field = mapping[h];
      const v = (r[i] ?? "").trim();
      if (field && v && !out[field]) out[field] = v.slice(0, 254);
    });
    return out;
  });
}
