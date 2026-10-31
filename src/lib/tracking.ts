import { createHash } from "node:crypto";
import { db } from "./db";
import { trackSchema, type TrackItem } from "./provider";
import { evaluateShipment } from "./exceptions";
export function validTime(e: { time_utc?: string; time_iso?: string }) {
  const raw = e.time_utc ?? e.time_iso;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date : null;
}
export function eventFingerprint(e: {
  at: Date;
  original: string;
  location: string;
  stage: string;
  source: string;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        e.at.toISOString(),
        e.original,
        e.location,
        e.stage,
        e.source,
      ]),
    )
    .digest("hex");
}
export async function ingestTrack(input: unknown) {
  const item: TrackItem = trackSchema.parse(input);
  const number = item.number.trim().toUpperCase();
  const ti = item.track_info;
  if (!ti) return;
  const shipment = await db.shipment.findUnique({ where: { number } });
  if (!shipment || shipment.demo) return;
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Shipment" WHERE id=${shipment.id} FOR UPDATE`;
    const current = await tx.shipment.findUniqueOrThrow({
      where: { id: shipment.id },
    });
    const providers = ti.tracking?.providers ?? [];
    const all = providers.flatMap((p) =>
      (p.events ?? []).map((e) => ({ e, source: p.provider?.name ?? "" })),
    );
    if (
      ti.latest_event &&
      !all.some(
        ({ e }) =>
          e.description === ti.latest_event!.description &&
          validTime(e)?.getTime() === validTime(ti.latest_event!)?.getTime() &&
          (e.location ?? "") === (ti.latest_event!.location ?? ""),
      )
    )
      all.push({ e: ti.latest_event, source: "" });
    for (const { e, source } of all) {
      const at = validTime(e);
      if (!at) continue;
      const original = e.description ?? "";
      const event = {
        at,
        original,
        location: e.location ?? "",
        stage: e.stage ?? "",
        source,
      };
      await tx.trackingEvent.upsert({
        where: {
          shipmentId_fingerprint: {
            shipmentId: current.id,
            fingerprint: eventFingerprint(event),
          },
        },
        update: {},
        create: {
          shipmentId: current.id,
          fingerprint: eventFingerprint(event),
          occurredAt: at,
          originalDescription: original,
          description: e.description_translation?.description ?? original,
          location: event.location,
          stage: event.stage,
          carrierSource: source,
        },
      });
    }
    const latest = ti.latest_event;
    const at = latest ? validTime(latest) : null;
    const newer = !current.lastEventAt || (!!at && at >= current.lastEventAt);
    await tx.shipment.update({
      where: { id: current.id },
      data: {
        lastSyncAt: new Date(),
        ...(newer
          ? {
              status: ti.latest_status?.status ?? current.status,
              subStatus: ti.latest_status?.sub_status ?? "",
              lastEventAt: at ?? current.lastEventAt,
              latestDescription:
                latest?.description_translation?.description ??
                latest?.description ??
                current.latestDescription,
              latestLocation: latest?.location ?? current.latestLocation,
            }
          : {}),
        ...(item.carrier ? { carrierCode: item.carrier } : {}),
        origin: ti.shipping_info?.shipper_address?.country ?? current.origin,
        destination:
          ti.shipping_info?.recipient_address?.country ?? current.destination,
      },
    });
  });
  await evaluateShipment(shipment.id);
}
