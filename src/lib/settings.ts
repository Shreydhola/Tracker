import { z } from "zod";
import { db } from "./db";
export const settingsSchema = z
  .object({
    noMovementWarning: z.number().int().min(1).max(90),
    noMovementHigh: z.number().int().min(1).max(180),
    transitWarning: z.number().int().min(1).max(180),
    transitHigh: z.number().int().min(1).max(365),
    monthlyAllowance: z.number().int().min(1),
    recipients: z.array(z.email()).max(10),
    immediateUrgent: z.boolean(),
    dailyHourUTC: z.number().int().min(0).max(23),
    disabledCategories: z.array(z.string()).max(30),
    priorityOverrides: z
      .record(z.string(), z.number().int().min(1).max(3))
      .default({}),
    carrierDetection: z.enum(["auto", "require-code"]).default("auto"),
    defaultMarketplace: z.enum(["Amazon US", "Amazon CA"]),
  })
  .refine(
    (s) =>
      s.noMovementHigh >= s.noMovementWarning &&
      s.transitHigh >= s.transitWarning,
    "High thresholds must be at least warning thresholds",
  );
export type Settings = z.infer<typeof settingsSchema>;
export const defaults: Settings = {
  noMovementWarning: 3,
  noMovementHigh: 5,
  transitWarning: 12,
  transitHigh: 15,
  monthlyAllowance: 3000,
  recipients: [],
  immediateUrgent: false,
  dailyHourUTC: 8,
  disabledCategories: [],
  defaultMarketplace: "Amazon US",
  priorityOverrides: {},
  carrierDetection: "auto",
};
export async function getSettings() {
  const row = await db.systemSetting.findUnique({ where: { key: "settings" } });
  return row ? settingsSchema.parse(row.value) : defaults;
}
