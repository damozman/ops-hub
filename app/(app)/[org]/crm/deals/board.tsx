"use client";

import Link from "next/link";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { moveDeal } from "../actions";

type Stage = { id: string; name: string; outcome: string };
type Deal = {
  id: string;
  title: string;
  value: string;
  offer: string;
  stage_id: string;
  company: string | null;
  company_id: string | null;
};

/** Kanban for one pipeline. Drag a card or use its "Move to" menu. */
export function DealBoard({
  orgSlug,
  pipelineName,
  stages,
  deals,
  canWrite,
}: {
  orgSlug: string;
  pipelineName: string;
  stages: Stage[];
  deals: Deal[];
  canWrite: boolean;
}) {
  const [optimistic, setOptimistic] = useOptimistic(deals, (state, move: { id: string; stage: string }) =>
    state.map((d) => (d.id === move.id ? { ...d, stage_id: move.stage } : d)),
  );
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function move(id: string, stage: string) {
    setError(null);
    startTransition(async () => {
      setOptimistic({ id, stage });
      const res = await moveDeal(orgSlug, id, stage);
      if (res.status === "error") setError(res.message ?? "Could not move the deal.");
      router.refresh();
    });
  }

  return (
    <section aria-label={`${pipelineName} board`} className="space-y-2">
      <h2 className="font-semibold">{pipelineName}</h2>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {stages.map((s) => (
          <div
            key={s.id}
            data-testid="stage-column"
            data-stage={s.name}
            className="w-60 shrink-0 rounded-lg border border-border bg-muted/40 p-2"
            onDragOver={(e) => canWrite && e.preventDefault()}
            onDrop={(e) => {
              const id = e.dataTransfer.getData("text/deal-id");
              if (canWrite && id) move(id, s.id);
            }}
          >
            <h3 className="mb-2 px-1 text-xs font-semibold uppercase text-muted-foreground">
              {s.name} ({optimistic.filter((d) => d.stage_id === s.id).length})
            </h3>
            <ul className="space-y-2">
              {optimistic
                .filter((d) => d.stage_id === s.id)
                .map((d) => (
                  <li
                    key={d.id}
                    data-testid="deal-card"
                    draggable={canWrite}
                    onDragStart={(e) => e.dataTransfer.setData("text/deal-id", d.id)}
                    className="rounded-md border border-border bg-card p-2 text-sm shadow-sm"
                  >
                    <div className="font-medium">{d.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {d.company_id ? (
                        <Link href={`/${orgSlug}/crm/companies/${d.company_id}`} className="hover:underline">
                          {d.company}
                        </Link>
                      ) : (
                        "No company"
                      )}{" "}
                      · {d.value} · offer {d.offer}
                    </div>
                    {canWrite && (
                      <select
                        aria-label={`Move ${d.title}`}
                        className="mt-1 w-full rounded border border-border bg-background text-xs"
                        value={d.stage_id}
                        onChange={(e) => move(d.id, e.target.value)}
                      >
                        {stages.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Refreshes the page when any deal in this org changes (Realtime, filtered by RLS). */
export function DealsRealtime({ orgId }: { orgId: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const supabase = supabaseBrowser();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    void (async () => {
      // Join with the user's token so Realtime applies RLS as them (otherwise it joins as anon and is refused).
      const { data } = await supabase.auth.getSession();
      if (cancelled || !data.session) return;
      await supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel(`deals:${orgId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "deals", filter: `org_id=eq.${orgId}` }, () => {
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => router.refresh(), 300);
        })
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [orgId, router]);
  return null;
}
