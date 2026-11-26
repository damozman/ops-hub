import "server-only";

export type ActionState = { status: "idle" | "ok" | "error"; message?: string; id?: string };

export const ok = (message?: string, id?: string): ActionState => ({ status: "ok", message, id });
export const fail = (message: string): ActionState => ({ status: "error", message });

/** Turns database refusals into plain messages without leaking internals. */
export function dbFail(error: { code?: string; message?: string } | null): ActionState | null {
  if (!error) return null;
  switch (error.code) {
    case "42501":
      return fail(
        error.message && !error.message.includes("row-level security")
          ? error.message
          : "Your role isn't allowed to make this change.",
      );
    case "23505":
      return fail("That already exists (for example, a contact with the same email).");
    case "23514":
    case "23503":
    case "22023":
      return fail(error.message ?? "That change isn't allowed.");
    default:
      console.error("action failed", error.code);
      return fail("Something went wrong. Nothing was changed.");
  }
}

export function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}
export function optStr(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s === "" ? null : s;
}
