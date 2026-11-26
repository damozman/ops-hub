import { z } from "zod";

// Names match .env.example. Secrets never use the NEXT_PUBLIC_ prefix.
export const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  APP_BASE_URL: z.url(),
  APP_ENV: z.enum(["development", "preview", "production"]).default("development"),
  DEPLOY_MODE: z.enum(["cloud", "lan"]).default("cloud"),
  AUDIT_IP_HASH_SALT: z.string().min(32, "AUDIT_IP_HASH_SALT must be at least 32 characters"),
  MAILER_DRIVER: z.enum(["local", "resend"]).default("local"),
  MAILPIT_URL: z.url().default("http://127.0.0.1:54324"),
  FORMS_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).max(1000).default(10),
  CRON_SECRET: z.string().min(32, "CRON_SECRET must be at least 32 characters").optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    const names = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid server environment. Check .env.local. ${names}`);
  }
  if (result.data.APP_ENV === "production" && result.data.MAILER_DRIVER === "local") {
    throw new Error("MAILER_DRIVER=local is not allowed in production");
  }
  return result.data;
}
