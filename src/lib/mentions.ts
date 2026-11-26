// Finds "@Display Name" mentions in comment text. Pure and unit-tested.
// Longer names win, so "@Chris (dev)" isn't read as "@Chris".

export type Mentionable = { id: string; name: string };

export function extractMentions(body: string, people: Mentionable[]): string[] {
  const found = new Set<string>();
  const sorted = [...people].filter((p) => p.name.trim()).sort((a, b) => b.name.length - a.name.length);
  const lower = body.toLowerCase();
  const consumed: [number, number][] = [];
  for (const person of sorted) {
    const token = `@${person.name.toLowerCase()}`;
    let from = 0;
    while (true) {
      const at = lower.indexOf(token, from);
      if (at === -1) break;
      const end = at + token.length;
      const nextChar = lower.charAt(end);
      const overlaps = consumed.some(([s, e]) => at < e && end > s);
      if (!overlaps && (nextChar === "" || !/[a-z0-9_]/.test(nextChar))) {
        found.add(person.id);
        consumed.push([at, end]);
      }
      from = end;
    }
  }
  return [...found];
}
