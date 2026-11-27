import "server-only";
import { createSupabaseServerClient } from "@/server/db/server-client";

/**
 * Outbox senders (kickoff §J). Phases 0-2 only have the `manual` sender: a human sends
 * the approved content by hand, then release_outbox() records it as sent. Phase 6 adds
 * Resend / Twilio / GBP senders behind this same interface; every sender goes through
 * release_outbox(), which refuses unless the approved hash equals the item's hash.
 */
export interface OutboxSender {
  readonly name: "manual";
  release(outboxId: string): Promise<{ ok: true } | { ok: false; code?: string; message: string }>;
}

export const manualSender: OutboxSender = {
  name: "manual",
  async release(outboxId) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("release_outbox", { p_id: outboxId });
    if (error) return { ok: false, code: error.code, message: error.message };
    return { ok: true };
  },
};

export function senderFor(): OutboxSender {
  return manualSender;
}
