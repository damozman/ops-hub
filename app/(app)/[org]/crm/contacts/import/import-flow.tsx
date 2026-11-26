"use client";

import { useActionState } from "react";
import { previewImport, runImport, type ImportState, type PreviewState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/card";

const FIELDS = [
  ["", "Ignore"],
  ["first_name", "First name"],
  ["last_name", "Last name"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["title", "Title"],
  ["company", "Company"],
] as const;

export function ImportFlow({ orgSlug, brands }: { orgSlug: string; brands: { id: string; name: string }[] }) {
  const [preview, previewAction, previewing] = useActionState<PreviewState, FormData>(previewImport, {
    status: "idle",
  });
  const [result, importAction, importing] = useActionState<ImportState, FormData>(runImport, { status: "idle" });

  return (
    <div className="space-y-6">
      <form action={previewAction} className="space-y-3">
        <input type="hidden" name="org" value={orgSlug} />
        <div className="space-y-1">
          <Label htmlFor="csv-file">CSV file (up to 2 MB)</Label>
          <Input id="csv-file" name="file" type="file" accept=".csv,text/csv" required />
        </div>
        <Button type="submit" size="sm" disabled={previewing}>
          {previewing ? "Checking…" : "Upload and preview"}
        </Button>
        {preview.status === "error" && <Alert tone="error">{preview.message}</Alert>}
        {preview.status === "blocked" && (
          <Alert tone="error" data-testid="import-blocked">
            {preview.message}
          </Alert>
        )}
      </form>

      {preview.status === "preview" && (
        <form action={importAction} className="space-y-3" key={preview.fileId}>
          <input type="hidden" name="org" value={orgSlug} />
          <input type="hidden" name="file_id" value={preview.fileId} />
          <p className="text-sm">{preview.rowCount} data rows. Match each column to a contact field:</p>
          <div className="max-w-sm space-y-1">
            <Label htmlFor="import-brand">Brand for new companies and contacts without a company</Label>
            <Select id="import-brand" name="brand_id" defaultValue={brands.length === 1 ? brands[0].id : ""}>
              {brands.length > 1 && <option value="">No brand (shared)</option>}
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr>
                  {preview.headers.map((h, i) => (
                    <th key={i} className="p-2 text-left">
                      <div className="mb-1 font-medium">{h}</div>
                      <Select name={`map_${i}`} aria-label={`Map ${h}`} defaultValue={preview.mapping[h] ?? ""}>
                        {FIELDS.map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </Select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.sample.map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    {preview.headers.map((_, j) => (
                      <td key={j} className="p-2 text-muted-foreground">
                        {r[j]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button type="submit" size="sm" disabled={importing || result.status === "ok"}>
            {importing ? "Importing…" : "Import contacts"}
          </Button>
          {result.status === "ok" && <Alert tone="success">{result.message}</Alert>}
          {result.status === "error" && <Alert tone="error">{result.message}</Alert>}
        </form>
      )}
    </div>
  );
}
