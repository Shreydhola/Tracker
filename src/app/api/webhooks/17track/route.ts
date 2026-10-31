import { NextRequest, NextResponse } from "next/server";
import { hashToken, rateLimit } from "@/lib/auth";
import { verifySignature } from "@/lib/provider";
import { db } from "@/lib/db";
import { queue } from "@/lib/queue";
import { liveProviderReady } from "@/lib/config";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  if (!liveProviderReady())
    return NextResponse.json(
      { error: "Provider verification not configured" },
      { status: 503 },
    );
  try {
    await rateLimit("webhook", 300, 60);
  } catch {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }
  if (Number(req.headers.get("content-length")) > 2 * 1024 * 1024)
    return new NextResponse(null, { status: 413 });
  const reader = req.body?.getReader();
  if (!reader) return new NextResponse(null, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 2 * 1024 * 1024) {
      await reader.cancel();
      return new NextResponse(null, { status: 413 });
    }
    chunks.push(value);
  }
  const raw = Buffer.concat(chunks);
  if (
    !verifySignature(
      raw,
      req.headers.get("sign") ?? "",
      process.env.TRACK17_API_KEY!,
    )
  )
    return new NextResponse(null, { status: 403 });
  let payload;
  try {
    payload = JSON.parse(raw.toString("utf8"));
    if (
      !payload ||
      typeof payload !== "object" ||
      !["TRACKING_UPDATED", "TRACKING_STOPPED"].includes(payload.event)
    )
      return new NextResponse(null, { status: 400 });
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const id = hashToken(raw.toString("utf8"));
  await db.webhookEvent.upsert({
    where: { id },
    update: {},
    create: { id, payload, rawBody: raw.toString("utf8") },
  });
  try {
    await (
      await queue()
    ).send("webhook", { id }, { singletonKey: id, singletonSeconds: 300 });
  } catch {
    /* The worker maintenance outbox recovers persisted pending events. */
  }
  return NextResponse.json({ code: 0 });
}
