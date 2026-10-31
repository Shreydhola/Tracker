/** Starter-derived v2.4 contract. Disabled until checked against the official
 * documentation and the API version enabled for the deployment account. */
import { createHash, timingSafeEqual } from "node:crypto";
import https from "node:https";
import { HttpsProxyAgent } from "https-proxy-agent";
import { z } from "zod";
import { liveProviderReady } from "./config";
export const BATCH_SIZE = 40;
export const eventSchema = z
  .object({
    time_utc: z.string().optional(),
    time_iso: z.string().optional(),
    description: z.string().optional(),
    description_translation: z
      .object({ description: z.string().optional() })
      .nullish(),
    location: z.string().nullish(),
    stage: z.string().nullish(),
  })
  .passthrough();
export const trackSchema = z
  .object({
    number: z.string(),
    carrier: z.number().nullish(),
    track_info: z
      .object({
        latest_status: z
          .object({ status: z.string(), sub_status: z.string().nullish() })
          .nullish(),
        latest_event: eventSchema.nullish(),
        shipping_info: z
          .object({
            shipper_address: z
              .object({ country: z.string().nullish() })
              .nullish(),
            recipient_address: z
              .object({ country: z.string().nullish() })
              .nullish(),
          })
          .nullish(),
        tracking: z
          .object({
            providers: z
              .array(
                z.object({
                  provider: z
                    .object({ name: z.string().optional() })
                    .optional(),
                  events: z.array(eventSchema).nullish(),
                }),
              )
              .nullish(),
          })
          .nullish(),
      })
      .nullish(),
  })
  .passthrough();
export type TrackItem = z.infer<typeof trackSchema>;
export const responseSchema = z.object({
  code: z.number(),
  data: z.object({
    accepted: z
      .array(
        z
          .object({ number: z.string(), carrier: z.number().nullish() })
          .passthrough(),
      )
      .default([]),
    rejected: z
      .array(
        z
          .object({
            number: z.string(),
            error: z
              .object({
                code: z.union([z.number(), z.string()]).optional(),
                message: z.string().optional(),
              })
              .optional(),
          })
          .passthrough(),
      )
      .default([]),
  }),
});
export class ProviderError extends Error {
  constructor(
    message: string,
    public retryable = true,
  ) {
    super(message);
  }
}
export function verifySignature(raw: Buffer, signature: string, key: string) {
  if (!key || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHash("sha256")
    .update(raw)
    .update("/")
    .update(key)
    .digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
export async function requestProvider(
  path: "register" | "gettrackinfo",
  body: unknown,
) {
  if (!liveProviderReady())
    throw new ProviderError(
      "Live tracking disabled: verify official API contract and configure credentials",
      false,
    );
  if (process.env.TRACK17_API_VERSION !== "2.4")
    throw new ProviderError(
      "Only the starter-derived v2.4 adapter exists; verify account version",
      false,
    );
  const payload = JSON.stringify(body);
  const url = new URL(`https://api.17track.net/track/v2.4/${path}`);
  const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  const response = await new Promise<string>((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "POST",
        agent: proxy ? new HttpsProxyAgent(proxy) : undefined,
        headers: {
          "17token": process.env.TRACK17_API_KEY!,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
          if (data.length > 8 * 1024 * 1024)
            req.destroy(new ProviderError("Provider response exceeded limit"));
        });
        res.on("end", () => {
          if (res.statusCode !== 200)
            return reject(
              new ProviderError(
                `17TRACK HTTP ${res.statusCode}`,
                res.statusCode === 429 || Number(res.statusCode) >= 500,
              ),
            );
          resolve(data);
        });
      },
    );
    req.setTimeout(30000, () =>
      req.destroy(new ProviderError("17TRACK request timed out")),
    );
    req.on("error", () =>
      reject(new ProviderError("17TRACK network request failed")),
    );
    req.end(payload);
  });
  const parsed = responseSchema.safeParse(JSON.parse(response));
  if (!parsed.success)
    throw new ProviderError("Unexpected provider response contract", false);
  if (parsed.data.code !== 0)
    throw new ProviderError(`17TRACK API code ${parsed.data.code}`);
  return parsed.data.data;
}
