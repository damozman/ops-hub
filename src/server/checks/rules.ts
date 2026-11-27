// Rule implementations. Each rule's limits, word lists and patterns are DATA in
// public.check_rules.params (seeded from BUILD_PLAN §3.5 items 1-11); the code here only
// knows how to apply them. Patterns are case-insensitive regular expressions.
import type { CheckContext, DraftContent, Span, TextField } from "./types";

export type Hit = { message: string; span?: Span };
export type RuleImpl = (content: DraftContent, ctx: CheckContext, params: Record<string, unknown>) => Hit[];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** Every text field of a draft, with a path for highlighting. Flags and notes are not scanned. */
export function textFields(content: DraftContent): TextField[] {
  const out: TextField[] = [];
  const skip = new Set(["substantiation", "first_message", "marketing"]);
  const walk = (v: unknown, path: string) => {
    if (typeof v === "string") out.push({ field: path, text: v });
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === "object")
      for (const [k, x] of Object.entries(v)) if (!skip.has(k)) walk(x, path ? `${path}.${k}` : k);
  };
  walk(content, "");
  return out;
}

function compile(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, "giu");
  } catch {
    return null;
  }
}

/** First match of any pattern in any field. One hit per field per pattern keeps results readable. */
function scan(fields: TextField[], patterns: string[], message: (m: string) => string): Hit[] {
  const hits: Hit[] = [];
  for (const p of patterns) {
    const re = compile(p);
    if (!re) continue;
    for (const f of fields) {
      re.lastIndex = 0;
      const m = re.exec(f.text);
      if (m)
        hits.push({ message: message(m[0]), span: { field: f.field, start: m.index, end: m.index + m[0].length } });
    }
  }
  return hits;
}

function appliesTo(params: Record<string, unknown>, ctx: CheckContext): boolean {
  const kinds = strList(params.kinds);
  if (kinds.length && !kinds.includes(ctx.kind)) return false;
  const markets = strList(params.marketplaces);
  if (markets.length && !markets.includes(ctx.marketplace)) return false;
  return true;
}

function fieldsOf(content: DraftContent, params: Record<string, unknown>): TextField[] {
  const only = strList(params.fields);
  const all = textFields(content);
  return only.length ? all.filter((f) => only.some((o) => f.field === o || f.field.startsWith(`${o}[`))) : all;
}

// ---------------------------------------------------------------------------
// SMS segment math (GSM-7: 160 / 153 per part; UCS-2: 70 / 67 per part)
// ---------------------------------------------------------------------------
const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\u001bÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXT = "^{}\\[~]|€\f";

export function smsSegments(text: string): { encoding: "GSM-7" | "UCS-2"; units: number; segments: number } {
  let units = 0;
  let gsm = true;
  for (const ch of text) {
    if (GSM7_BASIC.includes(ch)) units += 1;
    else if (GSM7_EXT.includes(ch)) units += 2;
    else {
      gsm = false;
      break;
    }
  }
  if (gsm) return { encoding: "GSM-7", units, segments: units === 0 ? 0 : units <= 160 ? 1 : Math.ceil(units / 153) };
  const ucs = [...text].reduce((n, ch) => n + (ch.codePointAt(0)! > 0xffff ? 2 : 1), 0);
  return { encoding: "UCS-2", units: ucs, segments: ucs <= 70 ? 1 : Math.ceil(ucs / 67) };
}

// ---------------------------------------------------------------------------
// Luhn (card numbers)
// ---------------------------------------------------------------------------
export function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return digits.length >= 13 && sum % 10 === 0;
}

// ---------------------------------------------------------------------------
// Numbers for spec fidelity
// ---------------------------------------------------------------------------
function numbersIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) out.add(String(Number(m[0].replace(/,/g, ""))));
  return out;
}

function flattenStrings(v: unknown): string[] {
  if (v == null) return [];
  if (typeof v === "string") return [v];
  if (typeof v === "number" || typeof v === "boolean") return [String(v)];
  if (Array.isArray(v)) return v.flatMap(flattenStrings);
  if (typeof v === "object") return Object.entries(v).flatMap(([k, x]) => [k, ...flattenStrings(x)]);
  return [];
}

// ---------------------------------------------------------------------------
// Implementations, keyed by rule_key
// ---------------------------------------------------------------------------
export const RULES: Record<string, RuleImpl> = {
  // 1. Required fields per kind / marketplace profile.
  "required.fields": (content, ctx, params) => {
    const profiles = (params.profiles ?? {}) as Record<string, unknown>;
    const forKind = profiles[ctx.kind];
    const required =
      ctx.kind === "listing" && forKind && typeof forKind === "object" && !Array.isArray(forKind)
        ? strList((forKind as Record<string, unknown>)[ctx.marketplace] ?? (forKind as Record<string, unknown>).other)
        : strList(forKind);
    return required
      .filter((f) => {
        const v = content[f];
        if (Array.isArray(v)) return v.filter((x) => typeof x === "string" && x.trim()).length === 0;
        return typeof v !== "string" ? v == null : v.trim().length === 0;
      })
      .map((f) => ({ message: `Required field "${f}" is missing.` }));
  },

  // 2. Length limits (data). Limits marked verify=true must be checked against the current style guide.
  "length.limits": (content, ctx, params) => {
    const hits: Hit[] = [];
    const limits = Array.isArray(params.limits) ? (params.limits as Record<string, unknown>[]) : [];
    for (const l of limits) {
      if (l.kind && l.kind !== ctx.kind) continue;
      if (l.marketplace && l.marketplace !== ctx.marketplace) continue;
      const field = str(l.field);
      const value = content[field];
      const verify = l.verify ? " (verify against the current style guide)" : "";
      if (typeof value === "string" && typeof l.max === "number" && [...value].length > l.max) {
        hits.push({
          message: `"${field}" is ${[...value].length} characters; the limit is ${l.max}${verify}.`,
          span: { field, start: l.max, end: value.length },
        });
      }
      if (Array.isArray(value)) {
        if (typeof l.maxItems === "number" && value.length > l.maxItems)
          hits.push({ message: `"${field}" has ${value.length} entries; the limit is ${l.maxItems}${verify}.` });
        if (typeof l.maxEach === "number")
          value.forEach((x, i) => {
            if (typeof x === "string" && [...x].length > (l.maxEach as number))
              hits.push({
                message: `"${field}" entry ${i + 1} is ${[...x].length} characters; the limit is ${l.maxEach}${verify}.`,
                span: { field: `${field}[${i}]`, start: l.maxEach as number, end: x.length },
              });
          });
      }
    }
    return hits;
  },

  "sms.segments": (content, ctx, params) => {
    if (!appliesTo(params, ctx)) return [];
    const body = str(content.body);
    const s = smsSegments(body);
    const max = num(params.warn_above, 2);
    return s.segments > max
      ? [
          {
            message: `This SMS is ${s.segments} segments (${s.encoding}, ${s.units} units); keep it to ${max} or fewer.`,
          },
        ]
      : [];
  },

  // 3. Banned claims and style.
  "claims.guaranteed": (content, ctx, params) =>
    appliesTo(params, ctx)
      ? scan(fieldsOf(content, params), strList(params.patterns), (m) => `Guaranteed-results claim: "${m}".`)
      : [],
  "claims.superlatives": (content, ctx, params) =>
    appliesTo(params, ctx) && !str(content.substantiation).trim()
      ? scan(
          fieldsOf(content, params),
          strList(params.patterns),
          (m) => `Unverifiable superlative "${m}" without a substantiation note.`,
        )
      : [],
  "claims.medical": (content, ctx, params) =>
    appliesTo(params, ctx)
      ? scan(fieldsOf(content, params), strList(params.patterns), (m) => `Medical / disease claim: "${m}".`)
      : [],
  "claims.fda": (content, ctx, params) =>
    appliesTo(params, ctx)
      ? scan(fieldsOf(content, params), strList(params.patterns), (m) => `Regulatory claim: "${m}".`)
      : [],
  "claims.pesticide": (content, ctx, params) =>
    appliesTo(params, ctx)
      ? scan(fieldsOf(content, params), strList(params.patterns), (m) => `Pesticide / antimicrobial claim: "${m}".`)
      : [],
  "claims.competitors": (content, ctx, params) => {
    if (!appliesTo(params, ctx)) return [];
    const names = strList(params.names).map((n) => `\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    return scan(fieldsOf(content, params), names, (m) => `Competitor brand name: "${m}".`);
  },
  "claims.title_promo": (content, ctx, params) =>
    appliesTo(params, ctx)
      ? scan(
          fieldsOf(content, params),
          strList(params.patterns),
          (m) => `Promo / price / shipping text in the title: "${m}".`,
        )
      : [],
  "claims.all_caps": (content, ctx, params) => {
    if (!appliesTo(params, ctx)) return [];
    const min = num(params.min_length, 4);
    const allow = new Set(strList(params.allow).map((w) => w.toUpperCase()));
    const hits: Hit[] = [];
    for (const f of fieldsOf(content, params)) {
      for (const m of f.text.matchAll(/\b[A-Z][A-Z0-9]+\b/g)) {
        const letters = m[0].replace(/[0-9]/g, "");
        if (letters.length >= min && !allow.has(m[0])) {
          hits.push({
            message: `ALL CAPS word "${m[0]}".`,
            span: { field: f.field, start: m.index!, end: m.index! + m[0].length },
          });
          break;
        }
      }
    }
    return hits;
  },
  "claims.emoji": (content, ctx, params) => {
    if (!appliesTo(params, ctx)) return [];
    return scan(fieldsOf(content, params), ["\\p{Extended_Pictographic}"], (m) => `Emoji "${m}" is not allowed here.`);
  },

  // 4. Spec fidelity: every number with a unit must appear in the job item's source data.
  "spec.fidelity": (content, ctx, params) => {
    if (!appliesTo(params, ctx)) return [];
    const units = strList(params.units);
    if (!units.length) return [];
    const source = new Set<string>();
    for (const s of flattenStrings(ctx.sourceData)) for (const n of numbersIn(s)) source.add(n);
    const re = new RegExp(`(\\d[\\d,]*(?:\\.\\d+)?)\\s?(?:${units.join("|")})(?![\\p{L}])`, "giu");
    const hits: Hit[] = [];
    for (const f of fieldsOf(content, params)) {
      for (const m of f.text.matchAll(re)) {
        const value = String(Number(m[1].replace(/,/g, "")));
        if (!source.has(value))
          hits.push({
            message: `Unverified spec "${m[0]}": not found in the item's source data. Confirm it with the client.`,
            span: { field: f.field, start: m.index!, end: m.index! + m[0].length },
          });
      }
    }
    return hits;
  },

  // 5. Reviews (Google policy + FTC 16 CFR Part 465).
  "reviews.gating": (content, ctx, params) =>
    appliesTo(params, ctx)
      ? scan(
          fieldsOf(content, params),
          strList(params.patterns),
          (m) => `Review gating: "${m}". Ask every customer the same way.`,
        )
      : [],
  "reviews.incentive": (content, ctx, params) =>
    appliesTo(params, ctx)
      ? scan(fieldsOf(content, params), strList(params.patterns), (m) => `Incentive for a review: "${m}".`)
      : [],
  "reviews.positive_only": (content, ctx, params) =>
    appliesTo(params, ctx)
      ? scan(fieldsOf(content, params), strList(params.patterns), (m) => `Asks for positive reviews only: "${m}".`)
      : [],

  // 6. Review replies.
  "review_reply.personal_data": (content, ctx, params) =>
    appliesTo(params, ctx)
      ? scan(
          fieldsOf(content, params),
          strList(params.patterns),
          (m) => `Customer personal data in a public reply: "${m}".`,
        )
      : [],
  "review_reply.tone": (content, ctx, params) =>
    appliesTo(params, ctx)
      ? scan(fieldsOf(content, params), strList(params.patterns), (m) => `Argumentative wording: "${m}".`)
      : [],

  // 7. GBP content.
  "gbp.contact_in_post": (content, ctx, params) =>
    appliesTo(params, ctx)
      ? scan(
          fieldsOf(content, params),
          strList(params.patterns),
          (m) => `Phone number or URL in the post body: "${m}". Use the button instead.`,
        )
      : [],

  // 8. SMS (TCPA / CTIA / A2P). Consent, A2P status and quiet hours are checked at send time (Phase 6).
  "sms.stop": (content, ctx, params) => {
    if (!appliesTo(params, ctx) || content.first_message === false) return [];
    const re = compile(str(params.pattern) || "reply\\s+stop");
    return re && !re.test(str(content.body))
      ? [{ message: 'Missing opt-out wording, e.g. "Reply STOP to opt out".' }]
      : [];
  },
  "sms.brand": (content, ctx, params) => {
    if (!appliesTo(params, ctx) || !ctx.brandName) return [];
    return str(content.body).toLowerCase().includes(ctx.brandName.toLowerCase())
      ? []
      : [{ message: `The message must name the sender ("${ctx.brandName}").` }];
  },
  "sms.shortener": (content, ctx, params) =>
    appliesTo(params, ctx)
      ? scan(
          fieldsOf(content, params),
          strList(params.patterns),
          (m) => `URL shortener "${m}" (carriers filter these).`,
        )
      : [],
  "sms.shaft": (content, ctx, params) =>
    appliesTo(params, ctx)
      ? scan(fieldsOf(content, params), strList(params.patterns), (m) => `Restricted (SHAFT) content: "${m}".`)
      : [],

  // 9. Email (CAN-SPAM) for marketing email.
  "email.canspam": (content, ctx, params) => {
    if (!appliesTo(params, ctx) || content.marketing === false) return [];
    const body = str(content.body);
    const hits: Hit[] = [];
    const unsub = compile(str(params.unsubscribe_pattern) || "unsubscribe");
    const address = compile(str(params.address_pattern) || "\\d+\\s+\\w+");
    if (unsub && !unsub.test(body)) hits.push({ message: "Marketing email needs an unsubscribe link." });
    if (address && !address.test(body))
      hits.push({ message: "Marketing email needs the sender's physical postal address." });
    return hits;
  },

  // 10. Honesty.
  "honesty.urgency": (content, ctx, params) =>
    appliesTo(params, ctx)
      ? scan(fieldsOf(content, params), strList(params.patterns), (m) => `Possible fake urgency: "${m}".`)
      : [],
  "honesty.statistics": (content, ctx, params) =>
    appliesTo(params, ctx) && !str(content.substantiation).trim()
      ? scan(fieldsOf(content, params), strList(params.patterns), (m) => `Statistic "${m}" without a source note.`)
      : [],
  "honesty.testimonial": (content, ctx, params) =>
    appliesTo(params, ctx) && !str(content.substantiation).trim()
      ? scan(fieldsOf(content, params), strList(params.patterns), () => "Quoted testimonial without a source note.")
      : [],

  // 11. Data safety.
  "data.secrets": (content, ctx, params) =>
    scan(fieldsOf(content, params), strList(params.patterns), () => "Looks like a secret (API key or private key)."),
  "data.card_number": (content) => {
    const hits: Hit[] = [];
    for (const f of textFields(content))
      for (const m of f.text.matchAll(/\b(?:\d[ -]?){12,18}\d\b/g)) {
        if (luhnValid(m[0].replace(/[ -]/g, "")))
          hits.push({
            message: "Looks like a payment card number.",
            span: { field: f.field, start: m.index!, end: m.index! + m[0].length },
          });
      }
    return hits;
  },
  "data.ssn": (content, ctx, params) =>
    scan(fieldsOf(content, params), strList(params.patterns), () => "Looks like a US Social Security number."),
};
