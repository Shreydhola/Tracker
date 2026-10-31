import { z } from "zod";
export function config() {
  return z
    .object({
      DATABASE_URL: z.string().min(1),
      APP_URL: z.url(),
      APP_MODE: z.enum(["demo", "live"]),
    })
    .parse(process.env);
}
export function demoMode() {
  return config().APP_MODE === "demo";
}
export function liveProviderReady() {
  return (
    !demoMode() &&
    process.env.TRACK17_CONTRACT_VERIFIED === "true" &&
    !!process.env.TRACK17_API_KEY
  );
}
