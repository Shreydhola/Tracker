import type { Settings } from "./settings";
export type RuleShipment = {
  status: string;
  subStatus: string;
  shippedAt: Date | null;
  lastEventAt: Date | null;
  expectedAt: Date | null;
  registeredAt: Date | null;
  registrationError: string | null;
};
export type Incident = { type: string; priority: number; title: string };
export function evaluate(
  s: RuleShipment,
  c: Settings,
  now = new Date(),
): Incident[] {
  if (s.status === "Delivered") return [];
  const out: Incident[] = [];
  const add = (type: string, priority: number, title: string) =>
    out.push({ type, priority, title });
  if (s.registrationError)
    add("registration", 2, "Tracking registration needs attention");
  if (s.status === "DeliveryFailure")
    add("delivery_failed", 3, "Delivery attempt failed");
  if (s.status === "AvailableForPickup")
    add("pickup", 2, "Package awaiting pickup");
  if (
    ["Returning", "Returned"].includes(s.status) ||
    /Returned|Returning/.test(s.subStatus)
  )
    add("returned", 3, "Returned or returning to sender");
  if (s.status === "Exception")
    add("carrier_exception", 3, "Carrier reported an exception");
  if (/Customs/.test(s.subStatus)) add("customs", 2, "Customs action required");
  if (/Address/.test(s.subStatus))
    add("address", 3, "Carrier reported an address issue");
  if (/Lost/.test(s.subStatus)) add("lost", 3, "Carrier reported package lost");
  if (/Damage/.test(s.subStatus))
    add("damaged", 3, "Carrier reported package damage");
  if (s.status === "NotFound")
    add("not_found", 1, "Tracking information not found");
  if (s.registeredAt) {
    const age = (d: Date) =>
      Math.max(0, (now.getTime() - d.getTime()) / 86400000);
    const last = s.lastEventAt ?? s.shippedAt ?? s.registeredAt;
    const stale = age(last);
    if (stale >= c.noMovementWarning)
      add(
        "no_movement",
        stale >= c.noMovementHigh ? 2 : 1,
        `No tracking movement for ${Math.floor(stale)} days`,
      );
    if (s.shippedAt && age(s.shippedAt) > c.transitWarning)
      add(
        "long_transit",
        age(s.shippedAt) > c.transitHigh ? 2 : 1,
        "Shipment exceeded transit threshold",
      );
    if (s.expectedAt && now > s.expectedAt)
      add("deadline", 2, "Expected delivery date exceeded");
  }
  return out;
}
