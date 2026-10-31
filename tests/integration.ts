import "dotenv/config";
import assert from "node:assert/strict";
import { registerPending } from "../src/lib/registration";
import { notifications } from "../src/lib/mail";
import { defaults } from "../src/lib/settings";
import { db } from "../src/lib/db";
import { confirmImport } from "../src/lib/imports";
import { ingestTrack } from "../src/lib/tracking";
import { evaluateShipment } from "../src/lib/exceptions";
import { hashToken } from "../src/lib/auth";
async function main() {
  if (!process.env.DATABASE_URL?.includes("tracker_test"))
    throw new Error("Use a separate tracker_test database");
  process.env.APP_MODE = "live";
  const actor = "integration";
  const job = await db.importJob.create({
    data: {
      filename: "test.csv",
      createdBy: actor,
      rows: [
        { n: "TEST123456", o: "ORDER1" },
        { n: "TEST123456", o: "ORDER2" },
        { n: "invalid!" },
      ],
      mapping: { trackingNumber: "n", orderId: "o" },
    },
  });
  const mapping = { trackingNumber: "n", orderId: "o" };
  const result = (await confirmImport(
    job.id,
    actor,
    mapping,
    "Amazon US",
  )) as Record<string, number>;
  assert.equal(result.created, 1);
  assert.equal(result.duplicates, 1);
  assert.equal(result.invalid, 1);
  assert.deepEqual(
    await confirmImport(job.id, actor, mapping, "Amazon US"),
    result,
  );
  let shipment = await db.shipment.findUniqueOrThrow({
    where: { number: "TEST123456" },
  });
  await db.shipment.update({
    where: { id: shipment.id },
    data: { registeredAt: new Date() },
  });
  const item = {
    number: shipment.number,
    track_info: {
      latest_status: {
        status: "DeliveryFailure",
        sub_status: "DeliveryFailure",
      },
      latest_event: {
        time_utc: "2026-10-30T12:00:00Z",
        description: "Delivery attempt failed",
        location: "Toronto",
      },
      tracking: {
        providers: [
          {
            provider: { name: "Test Carrier" },
            events: [
              {
                time_utc: "2026-10-29T12:00:00Z",
                description: "Departed facility",
                location: "Origin",
                stage: "InTransit",
              },
              {
                time_utc: "2026-10-30T12:00:00Z",
                description: "Delivery attempt failed",
                location: "Toronto",
              },
            ],
          },
        ],
      },
    },
  };
  await ingestTrack(item);
  await ingestTrack(item);
  assert.equal(
    await db.trackingEvent.count({ where: { shipmentId: shipment.id } }),
    2,
  );
  await evaluateShipment(shipment.id);
  const count = await db.notification.count();
  await evaluateShipment(shipment.id);
  assert.equal(await db.notification.count(), count);
  await ingestTrack({
    ...item,
    track_info: {
      ...item.track_info,
      latest_status: { status: "InTransit" },
      latest_event: {
        time_utc: "2026-10-20T12:00:00Z",
        description: "Old event",
      },
    },
  });
  shipment = await db.shipment.findUniqueOrThrow({
    where: { id: shipment.id },
  });
  assert.equal(shipment.status, "DeliveryFailure");
  await ingestTrack({
    ...item,
    track_info: {
      latest_status: { status: "Delivered" },
      latest_event: {
        time_utc: "2026-10-31T12:00:00Z",
        description: "Delivered",
      },
    },
  });
  assert.equal(
    await db.deliveryException.count({
      where: { shipmentId: shipment.id, active: true },
    }),
    0,
  );
  assert.ok(
    (await db.trackingEvent.count({ where: { shipmentId: shipment.id } })) >= 4,
  );
  const raw = '{"event":"TRACKING_UPDATED","data":{}}';
  await Promise.all(
    [1, 2].map(() =>
      db.webhookEvent.upsert({
        where: { id: hashToken(raw) },
        update: {},
        create: { id: hashToken(raw), payload: JSON.parse(raw) },
      }),
    ),
  );
  assert.equal(await db.webhookEvent.count(), 1);
  process.env.TRACK17_API_KEY = "fixture-key-not-a-real-credential";
  process.env.TRACK17_CONTRACT_VERIFIED = "true";
  await db.shipment.createMany({
    data: Array.from({ length: 41 }, (_, i) => ({
      number: `REGTEST${String(i).padStart(8, "0")}`,
      demo: false,
    })),
  });
  let received = 0;
  await assert.rejects(() =>
    registerPending(async (path, body) => {
      assert.equal(path, "register");
      const batch = body as { number: string }[];
      received = batch.length;
      assert.equal(received, 40);
      return {
        accepted: batch.slice(0, 39),
        rejected: [
          { number: batch[39].number, error: { message: "Fixture rejection" } },
        ],
      };
    }),
  );
  assert.equal(
    await db.registrationAttempt.count({ where: { outcome: "accepted" } }),
    39,
  );
  await registerPending(async (_path, body) => ({
    accepted: body as { number: string }[],
    rejected: [],
  }));
  assert.equal(
    await db.shipment.count({
      where: { number: { startsWith: "REGTEST" }, registeredAt: { not: null } },
    }),
    41,
  );
  assert.equal(
    await db.shipment.count({
      where: {
        number: { startsWith: "REGTEST" },
        registrationError: { not: null },
      },
    }),
    0,
  );
  const large = await db.importJob.create({
    data: {
      filename: "5000.csv",
      createdBy: actor,
      rows: Array.from({ length: 5000 }, (_, i) => ({
        n: `LOADTEST${String(i).padStart(8, "0")}`,
      })),
      mapping: { trackingNumber: "n" },
    },
  });
  const load = (await confirmImport(
    large.id,
    actor,
    { trackingNumber: "n" },
    "Amazon US",
  )) as Record<string, number>;
  assert.equal(load.created, 5000);
  assert.equal(
    await db.shipment.count({ where: { number: { startsWith: "LOADTEST" } } }),
    5000,
  );
  await db.systemSetting.upsert({
    where: { key: "settings" },
    update: {
      value: {
        ...defaults,
        recipients: ["ops@example.com"],
        dailyHourUTC: (new Date().getUTCHours() + 1) % 24,
      },
    },
    create: {
      key: "settings",
      value: {
        ...defaults,
        recipients: ["ops@example.com"],
        dailyHourUTC: (new Date().getUTCHours() + 1) % 24,
      },
    },
  });
  const mail = await db.notification.create({
    data: {
      dedupeKey: "fixture-email",
      title: "Test-only alert",
      body: "Fixture shipment",
      priority: 3,
      emailState: "pending",
    },
  });
  await assert.rejects(() =>
    notifications(async () => {
      throw new Error("Fixture transport failure");
    }),
  );
  assert.equal(
    (await db.notification.findUniqueOrThrow({ where: { id: mail.id } }))
      .emailAttempts,
    1,
  );
  let sent = 0;
  await notifications(async (to) => {
    assert.deepEqual(to, ["ops@example.com"]);
    sent++;
  });
  await notifications(async () => {
    sent++;
  });
  assert.equal(sent, 1);
  assert.equal(
    (await db.notification.findUniqueOrThrow({ where: { id: mail.id } }))
      .emailState,
    "sent",
  );
  console.log(
    "PASS: idempotent imports, row errors, event retention, out-of-order delivery, notification deduplication, automatic resolution, webhook inbox deduplication, mocked batched registration/recovery, 5000-row database import, mocked email retry/deduplication",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
