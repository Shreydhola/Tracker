import "dotenv/config";
import { db } from "../src/lib/db";
import { demoMode } from "../src/lib/config";
import { evaluateAll } from "../src/lib/exceptions";
async function main() {
  if (!demoMode() || process.env.NODE_ENV === "production")
    throw new Error("Demo seeding requires APP_MODE=demo outside production");
  if (await db.shipment.count({ where: { demo: false } }))
    throw new Error("Live records exist. Use a separate demo database");
  const now = Date.now();
  const states = [
    "InTransit",
    "Delivered",
    "AvailableForPickup",
    "DeliveryFailure",
    "InfoReceived",
    "OutForDelivery",
    "Exception",
    "Returned",
  ];
  for (let i = 0; i < 32; i++) {
    const number = `DEMO${String(i + 1).padStart(8, "0")}`;
    const status = states[i % states.length];
    const shippedAt = new Date(now - ((i % 17) + 1) * 86400000);
    const lastEventAt = new Date(now - (i % 6) * 86400000);
    const s = await db.shipment.upsert({
      where: { number },
      update: {},
      create: {
        number,
        orderId: `DEMO-ORDER-${1000 + i}`,
        carrier: ["Yanwen", "YunExpress", "4PX", "SF Express"][i % 4],
        marketplace: i % 3 === 0 ? "Amazon CA" : "Amazon US",
        destination: i % 3 === 0 ? "CA" : "US",
        origin: "CN",
        status,
        shippedAt,
        lastEventAt,
        lastSyncAt: new Date(),
        registeredAt: shippedAt,
        latestDescription:
          status === "Delivered"
            ? "DEMO · Delivered to recipient"
            : "DEMO · Carrier checkpoint",
        latestLocation: i % 3 === 0 ? "Toronto, CA" : "Los Angeles, US",
        demo: true,
      },
    });
    await db.trackingEvent.upsert({
      where: {
        shipmentId_fingerprint: {
          shipmentId: s.id,
          fingerprint: "demo-origin",
        },
      },
      update: {},
      create: {
        shipmentId: s.id,
        fingerprint: "demo-origin",
        occurredAt: shippedAt,
        description: "DEMO · Shipment information received",
        originalDescription: "DEMO · Shipment information received",
        location: "Origin facility",
        stage: "InfoReceived",
        carrierSource: s.carrier,
      },
    });
  }
  await evaluateAll();
  console.log("32 isolated, clearly labeled demo shipments prepared");
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
