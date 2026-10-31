import "dotenv/config";
import { db } from "./lib/db";
import { queue } from "./lib/queue";
import { registerPending } from "./lib/registration";
import { evaluateAll } from "./lib/exceptions";
import { ingestTrack } from "./lib/tracking";
import { BATCH_SIZE, requestProvider } from "./lib/provider";
import { liveProviderReady, config, demoMode } from "./lib/config";
import { notifications } from "./lib/mail";
async function main() {
  config();
  const existing = await db.shipment.count({ where: { demo: !demoMode() } });
  if (existing)
    throw new Error("Database mode mismatch: separate demo and live databases");
  const boss = await queue();
  await boss.work("register", async () => {
    await registerPending();
  });
  await boss.work<{ id: string }>("webhook", async (jobs) => {
    for (const job of jobs) {
      const row = await db.webhookEvent.findUniqueOrThrow({
        where: { id: job.data.id },
      });
      if (row.state === "processed") continue;
      try {
        const payload = row.payload as { event?: string; data?: unknown };
        if (payload.event === "TRACKING_UPDATED") {
          const data = payload.data;
          const items = Array.isArray(data)
            ? data
            : data && typeof data === "object" && "accepted" in data
              ? (data as { accepted: unknown[] }).accepted
              : [data];
          for (const item of items) await ingestTrack(item);
        } else if (payload.event === "TRACKING_STOPPED") {
          const data = payload.data as { number?: string };
          if (data?.number)
            await db.shipment.updateMany({
              where: { number: data.number.toUpperCase() },
              data: {
                registrationError:
                  "Provider monitoring stopped; inspect account and reconcile",
              },
            });
        }
        await db.webhookEvent.update({
          where: { id: row.id },
          data: { state: "processed", processedAt: new Date(), error: null },
        });
      } catch {
        await db.webhookEvent.update({
          where: { id: row.id },
          data: {
            state: "failed",
            error:
              "Payload processing failed; inspect provider schema and replay",
          },
        });
        throw new Error("Webhook processing failed");
      }
    }
  });
  await boss.work("audit", async () => {
    await evaluateAll();
  });
  await boss.work<{ ids?: string[] }>("reconcile", async (jobs) => {
    if (!liveProviderReady()) return;
    const rows = await db.shipment.findMany({
      where: {
        demo: false,
        registeredAt: { not: null },
        status: { not: "Delivered" },
        ...(jobs[0]?.data?.ids ? { id: { in: jobs[0].data.ids } } : {}),
        OR: [
          { lastSyncAt: null },
          { lastSyncAt: { lt: new Date(Date.now() - 12 * 3600000) } },
        ],
      },
      take: BATCH_SIZE,
      orderBy: { lastSyncAt: { sort: "asc", nulls: "first" } },
    });
    if (rows.length) {
      const response = await requestProvider(
        "gettrackinfo",
        rows.map((s) => ({
          number: s.number,
          ...(s.carrierCode ? { carrier: s.carrierCode } : {}),
        })),
      );
      for (const item of response.accepted) await ingestTrack(item);
    }
  });
  await boss.work("notify", async () => {
    await notifications();
  });
  await boss.work("maintenance", async () => {
    await db.systemSetting.upsert({
      where: { key: "workerHeartbeat" },
      update: { value: new Date().toISOString() },
      create: { key: "workerHeartbeat", value: new Date().toISOString() },
    });
    const pending = await db.webhookEvent.findMany({
      where: { state: "pending" },
      take: 100,
    });
    for (const p of pending)
      await boss.send(
        "webhook",
        { id: p.id },
        { singletonKey: p.id, singletonSeconds: 300 },
      );
    await db.webhookEvent.deleteMany({
      where: {
        state: "processed",
        createdAt: { lt: new Date(Date.now() - 30 * 86400000) },
      },
    });
    await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await db.rateLimit.deleteMany({ where: { resetAt: { lt: new Date() } } });
    const c = await db.registrationAttempt.count({
      where: {
        createdAt: {
          gte: new Date(
            new Date().getUTCFullYear(),
            new Date().getUTCMonth(),
            1,
          ),
        },
      },
    });
    const { getSettings } = await import("./lib/settings");
    const settings = await getSettings();
    for (const pct of [80, 90, 100])
      if (c >= (settings.monthlyAllowance * pct) / 100) {
        const key = `usage:${new Date().toISOString().slice(0, 7)}:${pct}`;
        await db.notification.upsert({
          where: { dedupeKey: key },
          update: {},
          create: {
            dedupeKey: key,
            title: `Monthly registration attempts reached ${pct}% of allowance`,
            body: `${c} locally measured attempts; allowance ${settings.monthlyAllowance}. Provider balance is unavailable.`,
            priority: pct === 100 ? 3 : 1,
          },
        });
      }
  });
  for (const [name, cron] of [
    ["register", "*/2 * * * *"],
    ["maintenance", "* * * * *"],
    ["audit", "*/15 * * * *"],
    ["reconcile", "*/5 * * * *"],
    ["notify", "*/5 * * * *"],
  ])
    await boss.schedule(name, cron, {});
  await boss.send("maintenance", {});
  await boss.send("audit", {});
  console.log("Shipment worker ready; persistent schedules installed");
  for (const sig of ["SIGTERM", "SIGINT"])
    process.on(sig, async () => {
      await boss.stop();
      await db.$disconnect();
      process.exit(0);
    });
}
main().catch(async (e) => {
  console.error("Worker startup failed:", e.message);
  await db.$disconnect();
  process.exit(1);
});
