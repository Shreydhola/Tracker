export const fields = [
  "trackingNumber",
  "orderId",
  "carrier",
  "carrierCode",
  "customerName",
  "marketplace",
  "destination",
  "orderDate",
  "shippedAt",
  "expectedAt",
  "notes",
] as const;
export type Field = (typeof fields)[number];
export type Mapping = Partial<Record<Field, string>>;
