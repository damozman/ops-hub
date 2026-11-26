import "server-only";
import { z } from "zod";
import { parseServerEnv } from "@/lib/env-schema";

export type { ServerEnv } from "@/lib/env-schema";

let cached: ReturnType<typeof parseServerEnv> | null = null;

/** Validated server environment. Throws a readable error naming missing variables. */
export function serverEnv() {
  if (!cached) cached = parseServerEnv(process.env);
  return cached;
}

export const deployModeSchema = z.enum(["cloud", "lan"]);
