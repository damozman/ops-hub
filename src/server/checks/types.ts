// Checks engine types (BUILD_PLAN §3.5, kickoff §G). Pure data, no I/O.

export type Severity = "blocker" | "warning" | "info";

export type DraftKind =
  | "listing"
  | "gbp_description"
  | "gbp_post"
  | "review_reply"
  | "review_request"
  | "sms"
  | "email"
  | "other";

export type Marketplace = "amazon" | "walmart" | "shopify" | "gbp" | "openai_feed" | "other";

/** Draft content. Text fields are strings or string arrays; flags steer some rules. */
export type DraftContent = {
  title?: string;
  subject?: string;
  body?: string;
  description?: string;
  bullets?: string[];
  backend_keywords?: string;
  /** Free-text substantiation for superlatives / statistics ("Source: ..."). */
  substantiation?: string;
  /** sms: false when this is not the first message to the number. */
  first_message?: boolean;
  /** email: false for a transactional (non-marketing) email. */
  marketing?: boolean;
  [key: string]: unknown;
};

export type CheckContext = {
  kind: DraftKind;
  marketplace: Marketplace;
  brandName?: string;
  /** Job item source data (current live listing, spec sheet answers). Numbers in drafts must come from here. */
  sourceData?: unknown;
};

export type CheckRule = {
  rule_key: string;
  pack: string;
  title: string;
  severity: Severity;
  params: Record<string, unknown>;
  version: number;
  active: boolean;
};

export type Span = { field: string; start: number; end: number };

export type CheckResult = {
  rule_key: string;
  severity: Severity;
  message: string;
  span?: Span;
};

export type TextField = { field: string; text: string };
