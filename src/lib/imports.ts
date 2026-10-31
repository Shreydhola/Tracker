import { parse } from "csv-parse/sync";
import { validateWorkbookZip } from "./zip";
import { readSheet } from "read-excel-file/node";
import { z } from "zod";
import { db } from "./db";
import { demoMode } from "./config";
import { getSettings } from "./settings";
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
const aliases: Record<Field, string[]> = {
  trackingNumber: [
    "trackingnumber",
    "trackingid",
    "number",
    "tracking",
    "waybill",
  ],
  orderId: ["orderid", "order", "amazonorderid"],
  carrier: ["carrier", "courier"],
  carrierCode: ["carriercode"],
  customerName: ["customername", "customer"],
  marketplace: ["marketplace", "market"],
  destination: ["destinationcountry", "destination", "country"],
  orderDate: ["orderdate"],
  shippedAt: ["shippeddate", "shippedat", "shipdate"],
  expectedAt: ["expecteddeliverydate", "expectedat", "deliverydate"],
  notes: ["notes", "note"],
};
export const normalizeNumber = (n: string) =>
  n.trim().replace(/\s+/g, "").toUpperCase();
export function autoMap(headers: string[]): Mapping {
  return Object.fromEntries(
    fields.map((f) => [
      f,
      headers.find((h) =>
        aliases[f].includes(h.toLowerCase().replace(/[^a-z0-9]/g, "")),
      ) ?? "",
    ]),
  );
}
export async function parseUpload(bytes: Buffer, filename: string) {
  if (bytes.length > 10 * 1024 * 1024)
    throw new Error("VALIDATION: File exceeds 10 MB");
  let rows: Record<string, string>[] = [];
  if (/\.txt$/i.test(filename)) {
    rows = bytes
      .toString("utf8")
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .filter((x) => x.trim())
      .map((x) => ({ tracking_number: x.trim() }));
  } else if (/\.csv$/i.test(filename)) {
    const data = parse(bytes, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: false,
      max_record_size: 10000,
    }) as string[][];
    if (!data.length) throw new Error("VALIDATION: Empty file");
    const first = data[0];
    const hasHeader = first.some((h) =>
      Object.values(aliases)
        .flat()
        .includes(h.toLowerCase().replace(/[^a-z0-9]/g, "")),
    );
    const headers = hasHeader
      ? first
      : first.length === 1
        ? ["tracking_number"]
        : first.map((_, i) => `Column ${i + 1}`);
    if (new Set(headers).size !== headers.length)
      throw new Error("VALIDATION: Duplicate column headings");
    rows = (hasHeader ? data.slice(1) : data).map((row) =>
      Object.fromEntries(headers.map((h, i) => [h, String(row[i] ?? "")])),
    );
  } else if (/\.xlsx$/i.test(filename)) {
    if (bytes.length < 22) throw new Error("VALIDATION: Invalid XLSX");
    validateWorkbookZip(bytes);
    const sheet = await readSheet(bytes);
    if (sheet.length > 10001 || sheet.some((r) => r.length > 100))
      throw new Error("VALIDATION: Worksheet is too large");
    const table = sheet
      .filter((r) => r.some((c) => c !== null))
      .map((r) =>
        r.map((c) =>
          c instanceof Date ? c.toISOString().slice(0, 10) : String(c ?? ""),
        ),
      );
    const first = table[0] ?? [];
    const hasHeader = first.some((h) =>
      Object.values(aliases)
        .flat()
        .includes(h.toLowerCase().replace(/[^a-z0-9]/g, "")),
    );
    const headers = hasHeader
      ? first
      : first.length === 1
        ? ["tracking_number"]
        : first.map((_, i) => `Column ${i + 1}`);
    if (new Set(headers).size !== headers.length)
      throw new Error("VALIDATION: Duplicate column headings");
    rows = (hasHeader ? table.slice(1) : table).map((r) =>
      Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])),
    );
  } else throw new Error("VALIDATION: Use CSV, XLSX, or TXT");
  if (!rows.length || rows.length > 10000)
    throw new Error("VALIDATION: Upload 1–10,000 rows");
  return {
    headers: Object.keys(rows[0]),
    rows,
    mapping: autoMap(Object.keys(rows[0])),
  };
}
const date = (s: string) => {
  if (!s) return null;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    Number.isNaN(Date.parse(s)) ||
    new Date(s).toISOString().slice(0, 10) !== s
  )
    throw new Error("Dates must use YYYY-MM-DD");
  return new Date(s);
};
export function validateRows(
  rows: Record<string, string>[],
  mapping: Mapping,
  defaultMarketplace = "Amazon US",
) {
  const seen = new Set<string>();
  return rows.map((row, index) => {
    const v = (f: Field) => (row[mapping[f] ?? ""] ?? "").trim();
    const number = normalizeNumber(v("trackingNumber"));
    try {
      if (!/^[A-Z0-9-]{5,50}$/.test(number))
        throw new Error(
          "Tracking number must contain 5–50 letters, numbers or hyphens",
        );
      const marketplace = v("marketplace") || defaultMarketplace;
      if (!["Amazon US", "Amazon CA"].includes(marketplace))
        throw new Error("Marketplace must be Amazon US or Amazon CA");
      const code = v("carrierCode");
      if (code && !/^\d{1,9}$/.test(code))
        throw new Error("Carrier code must be an official numeric identifier");
      const duplicate = seen.has(number);
      seen.add(number);
      const destination = (
        v("destination") || (marketplace === "Amazon CA" ? "CA" : "US")
      ).toUpperCase();
      if (!/^[A-Z]{2}$/.test(destination))
        throw new Error("Destination must be a two-letter country code");
      return {
        index,
        number,
        duplicate,
        error: null,
        data: {
          number,
          orderId: v("orderId").slice(0, 100),
          carrier: v("carrier").slice(0, 100),
          carrierCode: code ? Number(code) : null,
          customerName: v("customerName").slice(0, 200),
          marketplace,
          destination,
          orderDate: date(v("orderDate")),
          shippedAt: date(v("shippedAt")),
          expectedAt: date(v("expectedAt")),
          notes: v("notes").slice(0, 2000),
        },
      };
    } catch (e) {
      return {
        index,
        number,
        duplicate: false,
        error: (e as Error).message,
        data: null,
      };
    }
  });
}
export const mappingSchema = z.record(z.enum(fields), z.string().max(200));
export async function confirmImport(
  id: string,
  actor: string,
  mapping: Mapping,
  defaultMarketplace: string,
) {
  const settings = await getSettings();
  return db.$transaction(
    async (tx) => {
      const locked = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM "ImportJob" WHERE id=${id} FOR UPDATE`;
      if (!locked.length) throw new Error("VALIDATION: Import not found");
      const job = await tx.importJob.findUniqueOrThrow({ where: { id } });
      if (job.state === "completed") return job.result;
      if (job.createdBy !== actor) throw new Error("FORBIDDEN");
      const rows = validateRows(
        job.rows as Record<string, string>[],
        mapping,
        defaultMarketplace,
      );
      const result = {
        created: 0,
        duplicates: 0,
        invalid: 0,
        pending: 0,
        errors: [] as { row: number; error: string }[],
      };
      for (const r of rows) {
        if (
          r.data &&
          settings.carrierDetection === "require-code" &&
          !r.data.carrierCode
        ) {
          result.invalid++;
          result.errors.push({
            row: r.index + 1,
            error: "An official carrier code is required by Settings",
          });
          continue;
        }
        if (!r.data) {
          result.invalid++;
          result.errors.push({ row: r.index + 1, error: r.error! });
          continue;
        }
        const { number, ...meta } = r.data;
        const existing = await tx.shipment.findUnique({ where: { number } });
        if (existing) {
          if (existing.demo !== demoMode())
            throw new Error(
              "VALIDATION: Demo and live data cannot share a database",
            );
          const update = Object.fromEntries(
            Object.entries(meta).filter(([, v]) => v !== "" && v !== null),
          );
          await tx.shipment.update({
            where: { id: existing.id },
            data: update,
          });
          result.duplicates++;
        } else {
          await tx.shipment.create({ data: { ...r.data, demo: demoMode() } });
          result.created++;
          result.pending++;
        }
      }
      await tx.importJob.update({
        where: { id },
        data: {
          state: "completed",
          mapping: JSON.parse(JSON.stringify(mapping)),
          result,
          completedAt: new Date(),
        },
      });
      return result;
    },
    { timeout: 120000, maxWait: 15000 },
  );
}
export function safeCell(value: unknown) {
  const s = String(value ?? "");
  return /^[\s]*[=+@\-\t\r]/.test(s) ? "'" + s : s;
}
