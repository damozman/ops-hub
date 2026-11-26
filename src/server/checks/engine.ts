// runChecks(content, context, rules) -> CheckResult[] (kickoff §G). Pure and deterministic.
import { canonicalHash } from "@/lib/canonical-hash";
import { RULES } from "./rules";
import type { CheckContext, CheckResult, CheckRule, DraftContent } from "./types";

/** Global defaults overridden by org rows with the same rule_key. */
export function effectiveRules(rows: (CheckRule & { org_id: string | null })[]): CheckRule[] {
  const byKey = new Map<string, CheckRule & { org_id: string | null }>();
  for (const r of rows) {
    const prev = byKey.get(r.rule_key);
    if (!prev || (prev.org_id === null && r.org_id !== null)) byKey.set(r.rule_key, r);
  }
  return [...byKey.values()].sort((a, b) => a.rule_key.localeCompare(b.rule_key));
}

/** Identifies the exact rule set a run used (key, version, severity, params, active). */
export function rulesVersion(rules: CheckRule[]): string {
  const sig = rules
    .map((r) => ({ k: r.rule_key, v: r.version, s: r.severity, a: r.active, p: r.params as never }))
    .sort((a, b) => (a.k < b.k ? -1 : 1));
  return `r-${canonicalHash(sig).slice(0, 12)}`;
}

export function runChecks(content: DraftContent, context: CheckContext, rules: CheckRule[]): CheckResult[] {
  const results: CheckResult[] = [];
  for (const rule of rules) {
    if (!rule.active) continue;
    const impl = RULES[rule.rule_key];
    if (!impl) continue; // unknown keys are data for a later engine version
    for (const hit of impl(content, context, rule.params ?? {})) {
      results.push({ rule_key: rule.rule_key, severity: rule.severity, message: hit.message, span: hit.span });
    }
  }
  return results;
}

export function summarize(results: CheckResult[]) {
  return {
    blockers: results.filter((r) => r.severity === "blocker").length,
    warnings: results.filter((r) => r.severity === "warning").length,
  };
}
