import { NextResponse, type NextRequest } from "next/server";
import { clientIp, submitPublicForm } from "@/server/forms/submit";
import { serverEnv } from "@/server/config/env";

const FIELDS = ["first_name", "last_name", "email", "phone", "company", "message"] as const;
const STATUS = { invalid: 400, spam: 400, rate_limited: 429, not_found: 404, error: 500 } as const;

/** Public form endpoint: accepts the hosted form (urlencoded) or JSON from an embed. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/forms/[formId]">) {
  const { formId } = await ctx.params;
  const isJson = request.headers.get("content-type")?.includes("application/json") ?? false;
  let input: Record<string, unknown>;
  try {
    input = isJson ? ((await request.json()) as Record<string, unknown>) : Object.fromEntries(await request.formData());
  } catch {
    return NextResponse.json({ ok: false, message: "Bad request." }, { status: 400 });
  }
  const text = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : "");
  const result = await submitPublicForm({
    formId,
    fields: Object.fromEntries(FIELDS.map((f) => [f, text(f)])),
    consent: input.consent === true || input.consent === "on" || input.consent === "true",
    honeypot: text("website_url"),
    ip: clientIp(request.headers),
  });

  if (isJson) {
    return result.ok
      ? NextResponse.json({ ok: true, redirect_url: result.redirectUrl })
      : NextResponse.json({ ok: false, message: result.message }, { status: STATUS[result.reason] });
  }
  const base = serverEnv().APP_BASE_URL;
  if (result.ok) return NextResponse.redirect(result.redirectUrl ?? `${base}/f/${formId}?sent=1`, 303);
  return NextResponse.redirect(`${base}/f/${formId}?error=${result.reason}`, 303);
}
