import "server-only";
import { createSupabaseAdminClient } from "@/server/db/admin-client";
import { effectiveRules, rulesVersion, runChecks } from "./engine";
import type { CheckContext, CheckRule, DraftContent, DraftKind, Marketplace } from "./types";

/**
 * Runs the checks engine on one draft version and records the result (BUILD_PLAN §3.5).
 * Called right after every version insert, whoever wrote it. The caller must already have
 * written the version with the user's own client (so RLS proved they may); results are
 * recorded with the service role because users can't write check results themselves.
 */
export async function runChecksForVersion(versionId: string, opts: { brandName?: string } = {}) {
  const admin = createSupabaseAdminClient();
  const { data: version, error } = await admin
    .from("draft_versions")
    .select(
      "id, org_id, content, drafts!draft_versions_draft_id_fkey(kind, job_item_id, job_items(marketplace, source_data))",
    )
    .eq("id", versionId)
    .single();
  if (error || !version) throw new Error("checks: version not found");

  const { data: ruleRows } = await admin
    .from("check_rules")
    .select("org_id, rule_key, pack, title, severity, params, version, active")
    .or(`org_id.is.null,org_id.eq.${version.org_id}`);
  const rules = effectiveRules((ruleRows ?? []) as (CheckRule & { org_id: string | null })[]);

  const draft = version.drafts as unknown as {
    kind: DraftKind;
    job_items: { marketplace: Marketplace; source_data: unknown } | null;
  };
  const ctx: CheckContext = {
    kind: draft.kind,
    marketplace: draft.job_items?.marketplace ?? "other",
    sourceData: draft.job_items?.source_data ?? {},
    brandName: opts.brandName,
  };
  const results = runChecks(version.content as DraftContent, ctx, rules);
  const { error: recErr } = await admin.rpc("record_check_run", {
    p_version: versionId,
    p_rules_version: rulesVersion(rules),
    p_results: results,
  });
  if (recErr) throw new Error(`checks: could not record results (${recErr.code})`);
  return results;
}
