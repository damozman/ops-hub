import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type GateInfo = {
  stage: string;
  gates: { gate: string; label: string; passed: boolean; blockers: string[] }[];
  moves: { to: string; kind: string }[];
  can_transition: boolean;
  can_cancel: boolean;
  can_override_g6: boolean;
};

const PATH = ["intake", "audit", "drafts", "review", "approved", "delivered", "upkeep"];
const GATE_FOR: Record<string, string> = {
  audit: "G1",
  drafts: "G2",
  review: "G3",
  approved: "G4",
  delivered: "G5",
  upkeep: "G6",
};

type Action = (
  prev: { status: "idle" | "ok" | "error"; message?: string },
  fd: FormData,
) => Promise<{ status: "idle" | "ok" | "error"; message?: string }>;

/** Each stage, the gate in front of it, its blockers, and the moves this user may try (BUILD_PLAN §6.2). */
export function StageGateBar({
  info,
  slug,
  jobId,
  action,
}: {
  info: GateInfo;
  slug: string;
  jobId: string;
  action: Action;
}) {
  const current = PATH.indexOf(info.stage);
  const gate = (g: string) => info.gates.find((x) => x.gate === g);
  return (
    <div className="space-y-3 rounded-lg border border-border p-4" data-testid="stage-gate-bar">
      <ol className="flex flex-wrap items-center gap-1 text-xs">
        {PATH.map((s, i) => {
          const g = GATE_FOR[s] ? gate(GATE_FOR[s]) : undefined;
          return (
            <li key={s} className="flex items-center gap-1">
              {g && (
                <span
                  title={g.passed ? `${g.gate} passes` : g.blockers.join("\n")}
                  className={cn(
                    "rounded px-1 font-mono",
                    g.passed ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400",
                  )}
                >
                  {g.gate}
                  {g.passed ? "✓" : "✗"}
                </span>
              )}
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5",
                  s === info.stage
                    ? "border-primary bg-primary text-primary-foreground"
                    : i < current
                      ? "border-border bg-muted"
                      : "border-border",
                )}
                aria-current={s === info.stage ? "step" : undefined}
              >
                {s}
              </span>
            </li>
          );
        })}
        {["closed", "cancelled"].includes(info.stage) && <Badge className="ml-2">{info.stage}</Badge>}
      </ol>

      {info.moves.length > 0 && (
        <div className="space-y-2">
          {info.moves.map((m) => {
            const g = m.kind.startsWith("G") ? gate(m.kind) : undefined;
            const allowed = m.kind === "cancel" ? info.can_cancel : info.can_transition;
            const needsReason = m.kind === "back" || m.kind === "cancel";
            const canOverride = m.kind === "G6" && !g?.passed && info.can_override_g6;
            return (
              <div key={m.to} className="rounded-md border border-border p-3 text-sm" data-testid={`move-${m.to}`}>
                <div className="font-medium">
                  {m.kind === "back" ? "Send back to" : m.kind === "cancel" ? "Cancel job" : "Move to"}{" "}
                  {m.kind !== "cancel" && m.to}
                  {g && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {g.gate}: {g.label}
                    </span>
                  )}
                </div>
                {g && !g.passed && (
                  <ul
                    className="mt-1 list-disc pl-5 text-xs text-amber-700 dark:text-amber-300"
                    data-testid={`blockers-${g.gate}`}
                  >
                    {g.blockers.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                )}
                {!allowed ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {m.kind === "cancel" ? "Only an owner or admin can cancel." : "Your role can't move jobs."}
                  </p>
                ) : (
                  <ActionForm
                    action={action}
                    submitLabel={
                      m.kind === "cancel"
                        ? "Cancel job"
                        : m.kind === "back"
                          ? `Send back to ${m.to}`
                          : `Move to ${m.to}`
                    }
                    pendingLabel="Moving…"
                    className="mt-2 flex flex-wrap items-center gap-2"
                  >
                    <input type="hidden" name="org" value={slug} />
                    <input type="hidden" name="job_id" value={jobId} />
                    <input type="hidden" name="to" value={m.to} />
                    {(needsReason || canOverride) && (
                      <Input
                        name="reason"
                        aria-label="Reason"
                        placeholder={needsReason ? "Reason (required)" : "Reason (for an override)"}
                        className="max-w-xs"
                        required={needsReason}
                      />
                    )}
                    {canOverride && (
                      <label className="flex items-center gap-1 text-xs">
                        <input type="checkbox" name="override" /> Owner override (upkeep agreed without a subscription)
                      </label>
                    )}
                  </ActionForm>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
