import { contentFields, wordDiff } from "@/lib/word-diff";
import type { Span } from "@/server/checks/types";

/**
 * Word-level before/after diff per field (BUILD_PLAN §6.2). "Before" is the job item's
 * source data or the previous version. Check spans on the "after" side are underlined.
 */
export function DiffViewer({
  before,
  after,
  beforeLabel,
  spans = [],
}: {
  before: unknown;
  after: unknown;
  beforeLabel: string;
  spans?: Span[];
}) {
  const a = contentFields(before);
  const b = contentFields(after);
  const fields = Object.keys(b).concat(Object.keys(a).filter((k) => !(k in b) && !(k === "substantiation")));
  if (fields.length === 0) return <p className="text-sm text-muted-foreground">Nothing to compare yet.</p>;
  return (
    <div className="space-y-3" data-testid="diff-viewer">
      <p className="text-xs text-muted-foreground">
        Compared with {beforeLabel}. <span className="rounded bg-emerald-500/20 px-1">Added</span>{" "}
        <span className="rounded bg-destructive/20 px-1 line-through">removed</span>{" "}
        <span className="underline decoration-amber-500 decoration-wavy">check finding</span>
      </p>
      {fields.map((f) => {
        const parts = wordDiff(a[f] ?? "", b[f] ?? "");
        const fieldSpans = spans.filter((s) => s.field === f || s.field.startsWith(`${f}[`));
        return (
          <div key={f} className="text-sm">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{f}</div>
            <div className="whitespace-pre-wrap rounded-md border border-border p-2 leading-relaxed">
              {parts.map((p, i) =>
                p.type === "same" ? (
                  <span key={i}>{p.text}</span>
                ) : p.type === "added" ? (
                  <ins key={i} className="rounded bg-emerald-500/20 no-underline">
                    {p.text}
                  </ins>
                ) : (
                  <del key={i} className="rounded bg-destructive/20">
                    {p.text}
                  </del>
                ),
              )}
            </div>
            {fieldSpans.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs">
                {fieldSpans.map((s, i) => {
                  const text = fieldText(after, s.field);
                  return (
                    <li key={i}>
                      <span className="text-muted-foreground">{s.field}: </span>
                      {text.slice(Math.max(0, s.start - 20), s.start)}
                      <mark className="bg-transparent underline decoration-amber-500 decoration-wavy">
                        {text.slice(s.start, s.end)}
                      </mark>
                      {text.slice(s.end, s.end + 20)}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function fieldText(content: unknown, path: string): string {
  if (!content || typeof content !== "object") return "";
  const m = /^([\w.]+)(?:\[(\d+)\])?$/.exec(path);
  if (!m) return "";
  const v = (content as Record<string, unknown>)[m[1]];
  if (m[2] !== undefined && Array.isArray(v)) return String(v[Number(m[2])] ?? "");
  return typeof v === "string" ? v : "";
}
