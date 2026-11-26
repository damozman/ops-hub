// Word-level diff for the DiffViewer (BUILD_PLAN §6.2). Pure; unit-tested.
export type DiffPart = { type: "same" | "added" | "removed"; text: string };

const tokenize = (s: string) => s.split(/(\s+)/).filter((t) => t.length > 0);

/** LCS over word tokens (whitespace kept as its own token). Falls back to remove-all/add-all for huge inputs. */
export function wordDiff(before: string, after: string, maxCells = 4_000_000): DiffPart[] {
  const a = tokenize(before);
  const b = tokenize(after);
  if (a.length * b.length > maxCells) {
    return [
      ...(before ? [{ type: "removed" as const, text: before }] : []),
      ...(after ? [{ type: "added" as const, text: after }] : []),
    ];
  }
  const dp: Uint32Array[] = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);

  const out: DiffPart[] = [];
  const push = (type: DiffPart["type"], text: string) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push("same", a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) push("removed", a[i++]);
    else push("added", b[j++]);
  }
  while (i < a.length) push("removed", a[i++]);
  while (j < b.length) push("added", b[j++]);
  return out;
}

/** Flattens draft content (or source data) into labeled text fields for side-by-side diffs. */
export function contentFields(content: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!content || typeof content !== "object" || Array.isArray(content)) return out;
  for (const [k, v] of Object.entries(content as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
    else if (Array.isArray(v) && v.every((x) => typeof x === "string")) out[k] = v.join("\n");
    else if (typeof v === "number" || typeof v === "boolean") out[k] = String(v);
  }
  return out;
}
