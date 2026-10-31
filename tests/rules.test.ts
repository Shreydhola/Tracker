import writeXlsxFile from "write-excel-file/node";
import { describe, it, expect } from "vitest";
import { evaluate } from "../src/lib/rules";
import { defaults } from "../src/lib/settings";
import { verifySignature } from "../src/lib/provider";
import { createHash } from "node:crypto";
import {
  normalizeNumber,
  validateRows,
  parseUpload,
  safeCell,
} from "../src/lib/imports";
import { eventFingerprint } from "../src/lib/tracking";
const now = new Date("2026-10-31T12:00:00Z"),
  ago = (n: number) => new Date(+now - n * 86400000);
const base = {
  status: "InTransit",
  subStatus: "",
  shippedAt: ago(4),
  lastEventAt: ago(4),
  expectedAt: null,
  registeredAt: ago(4),
  registrationError: null,
};
describe("delivery rules", () => {
  it("warns at 3 days, escalates at 5", () => {
    expect(
      evaluate(base, defaults, now).find((x) => x.type === "no_movement")
        ?.priority,
    ).toBe(1);
    expect(
      evaluate({ ...base, lastEventAt: ago(5) }, defaults, now).find(
        (x) => x.type === "no_movement",
      )?.priority,
    ).toBe(2);
  });
  it("never flags delivered shipments stale", () =>
    expect(
      evaluate(
        { ...base, status: "Delivered", shippedAt: ago(50) },
        defaults,
        now,
      ),
    ).toEqual([]));
  it("does not invent lost or damaged classifications from elapsed time", () => {
    expect(
      evaluate({ ...base, lastEventAt: ago(50) }, defaults, now).some((x) =>
        ["lost", "damaged"].includes(x.type),
      ),
    ).toBe(false);
  });
  it("supports urgent returns and pickup", () => {
    expect(
      evaluate({ ...base, status: "Returned" }, defaults, now).some(
        (x) => x.type === "returned" && x.priority === 3,
      ),
    ).toBe(true);
    expect(
      evaluate({ ...base, status: "AvailableForPickup" }, defaults, now).some(
        (x) => x.type === "pickup",
      ),
    ).toBe(true);
  });
  it("uses registration as a no-scan baseline", () =>
    expect(
      evaluate(
        { ...base, lastEventAt: null, shippedAt: null },
        defaults,
        now,
      ).some((x) => x.type === "no_movement"),
    ).toBe(true));
  it("keeps pending registration separate from transit delays", () =>
    expect(evaluate({ ...base, registeredAt: null }, defaults, now)).toEqual(
      [],
    ));
});
describe("import validation", () => {
  it("supports heading aliases and 5000 rows", async () => {
    const content =
      "Tracking Number,Order ID\n" +
      Array.from(
        { length: 5000 },
        (_, i) => `ABC${String(i).padStart(8, "0")},ORDER${i}`,
      ).join("\n");
    const p = await parseUpload(Buffer.from(content), "orders.csv");
    expect(p.rows).toHaveLength(5000);
    expect(validateRows(p.rows, p.mapping).filter((r) => r.error)).toHaveLength(
      0,
    );
  });
  it("reads tracking-only CSV", async () =>
    expect(
      (await parseUpload(Buffer.from("abc123\ndef456"), "list.csv")).rows,
    ).toHaveLength(2));
  it("normalizes, reports duplicates, validates dates and marketplace", () => {
    expect(normalizeNumber(" ab 123 ")).toBe("AB123");
    const rows = validateRows([{ n: "abc123" }, { n: "ABC123" }, { n: "!" }], {
      trackingNumber: "n",
    });
    expect(rows[1].duplicate).toBe(true);
    expect(rows[2].error).toBeTruthy();
    expect(
      validateRows([{ n: "ABC123", d: "2026-02-31" }], {
        trackingNumber: "n",
        shippedAt: "d",
      })[0].error,
    ).toBeTruthy();
  });
  it("escapes spreadsheet formulas", () =>
    expect(safeCell('=HYPERLINK("bad")')).toMatch(/^'/));
});
describe("webhook integrity", () => {
  it("requires a valid exact raw-body signature", () => {
    const raw = Buffer.from('{"event":"TRACKING_UPDATED"}'),
      key = "test-only-key";
    const sign = createHash("sha256")
      .update(raw)
      .update("/")
      .update(key)
      .digest("hex");
    expect(verifySignature(raw, sign, key)).toBe(true);
    expect(verifySignature(Buffer.from(raw.toString() + " "), sign, key)).toBe(
      false,
    );
    expect(verifySignature(raw, "x", key)).toBe(false);
  });
  it("deduplicates event fingerprints deterministically", () => {
    const e = {
      at: now,
      original: "Departed facility",
      location: "Toronto",
      stage: "InTransit",
      source: "Carrier",
    };
    expect(eventFingerprint(e)).toBe(eventFingerprint({ ...e }));
    expect(eventFingerprint({ ...e, location: "Vancouver" })).not.toBe(
      eventFingerprint(e),
    );
  });
});

it("imports XLSX rows after bounded archive validation", async () => {
  const data = await parseUpload(
    await writeXlsxFile([
      ["Tracking Number", "Order ID"],
      ["XLSX123456", "ORDER-X"],
    ]).toBuffer(),
    "shipments.xlsx",
  );
  expect(data.rows[0]["Tracking Number"]).toBe("XLSX123456");
  expect(validateRows(data.rows, data.mapping)[0].error).toBeNull();
});
