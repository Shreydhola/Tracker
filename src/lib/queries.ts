import type { Prisma } from "@prisma/client";
export const statuses = [
  "PendingRegistration",
  "InfoReceived",
  "NotFound",
  "InTransit",
  "OutForDelivery",
  "AvailableForPickup",
  "Delivered",
  "DeliveryFailure",
  "Exception",
  "Returned",
  "Returning",
  "Expired",
];
export const label = (s: string) => s.replace(/([a-z])([A-Z])/g, "$1 $2");
export function shipmentWhere(p: URLSearchParams): Prisma.ShipmentWhereInput {
  const q = p.get("q")?.slice(0, 100);
  const from = p.get("from"),
    to = p.get("to");
  return {
    ...(q
      ? {
          OR: [
            { number: { contains: q, mode: "insensitive" } },
            { orderId: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(p.get("status") ? { status: p.get("status")! } : {}),
    ...(p.get("carrier") ? { carrier: p.get("carrier")! } : {}),
    ...(p.get("marketplace") ? { marketplace: p.get("marketplace")! } : {}),
    ...(p.get("country") ? { destination: p.get("country")! } : {}),
    ...(p.get("issues") === "true"
      ? { exceptions: { some: { active: true } } }
      : {}),
    ...(p.get("delayed") === "true"
      ? {
          exceptions: {
            some: {
              active: true,
              type: { in: ["long_transit", "deadline", "no_movement"] },
            },
          },
        }
      : {}),
    ...((from &&
      /^\d{4}-\d{2}-\d{2}$/.test(from) &&
      !isNaN(Date.parse(from))) ||
    (to && /^\d{4}-\d{2}-\d{2}$/.test(to) && !isNaN(Date.parse(to)))
      ? {
          createdAt: {
            ...(from && !isNaN(Date.parse(from))
              ? { gte: new Date(from) }
              : {}),
            ...(to && !isNaN(Date.parse(to))
              ? { lt: new Date(new Date(to).getTime() + 86400000) }
              : {}),
          },
        }
      : {}),
  };
}
