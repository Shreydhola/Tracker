import { db } from "./db";
import { BATCH_SIZE, requestProvider, ProviderError } from "./provider";
import { liveProviderReady } from "./config";
import { evaluateShipment } from "./exceptions";
export async function registerPending(
  send: typeof requestProvider = requestProvider,
) {
  if (!liveProviderReady()) return;
  const rows = await db.shipment.findMany({
    where: { demo: false, registeredAt: null, registrationTries: { lt: 5 } },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
  });
  if (!rows.length) return;
  try {
    const response = await send(
      "register",
      rows.map((s) => ({
        number: s.number,
        ...(s.carrierCode ? { carrier: s.carrierCode } : {}),
        lang: "en",
      })),
    );
    for (const s of rows) {
      const accepted = response.accepted.find(
        (x) => x.number.toUpperCase() === s.number,
      );
      const rejected = response.rejected.find(
        (x) => x.number.toUpperCase() === s.number,
      );
      const error = accepted
        ? null
        : (rejected?.error?.message ??
          "Provider did not acknowledge registration");
      await db.$transaction([
        db.registrationAttempt.create({
          data: {
            shipmentId: s.id,
            outcome: accepted ? "accepted" : "rejected",
            response: JSON.parse(JSON.stringify(accepted ?? rejected ?? {})),
          },
        }),
        db.shipment.update({
          where: { id: s.id },
          data: {
            registrationTries: { increment: 1 },
            registrationError: error,
            ...(accepted
              ? {
                  registeredAt: new Date(),
                  status: "InfoReceived",
                  carrierCode: accepted.carrier ?? s.carrierCode,
                  externalId: s.number,
                }
              : {}),
          },
        }),
      ]);
      await evaluateShipment(s.id);
    }
    if (response.rejected.length)
      throw new ProviderError("Some registrations rejected");
  } catch (e) {
    if (
      e instanceof ProviderError &&
      e.message === "Some registrations rejected"
    )
      throw e;
    for (const s of rows) {
      await db.$transaction([
        db.registrationAttempt.create({
          data: {
            shipmentId: s.id,
            outcome: "error",
            response: {
              error: e instanceof Error ? e.message : "Provider error",
            },
          },
        }),
        db.shipment.update({
          where: { id: s.id },
          data: {
            registrationTries: { increment: 1 },
            registrationError:
              e instanceof Error ? e.message : "Provider error",
          },
        }),
      ]);
      await evaluateShipment(s.id);
    }
    throw e;
  }
}
