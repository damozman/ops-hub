import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/server/config/env";
import { sendNotificationDigest } from "@/server/notifications/digest";

function authorized(header: string | null, secret: string | undefined) {
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Daily notification digest. Call with `Authorization: Bearer $CRON_SECRET`. */
export async function POST(request: NextRequest) {
  if (!authorized(request.headers.get("authorization"), serverEnv().CRON_SECRET)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const result = await sendNotificationDigest();
  return NextResponse.json({ ok: true, ...result });
}

export const GET = POST;
