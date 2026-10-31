import nodemailer from "nodemailer";
import https from "node:https";
import { HttpsProxyAgent } from "https-proxy-agent";
import { db } from "./db";
import { getSettings } from "./settings";
import { demoMode } from "./config";
export async function sendEmail(to: string[], subject: string, text: string) {
  if (demoMode()) throw new Error("Email is disabled in demo mode");
  const from = process.env.EMAIL_FROM;
  if (!from || !to.length) throw new Error("Configure sender and recipients");
  if (process.env.SMTP_HOST) {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      requireTLS: process.env.SMTP_SECURE !== "true",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
      connectionTimeout: 15000,
      socketTimeout: 30000,
    });
    await transport.sendMail({ from, to: to.join(","), subject, text });
    return;
  }
  if (process.env.RESEND_API_KEY) {
    const payload = JSON.stringify({ from, to, subject, text });
    const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
    await new Promise<void>((resolve, reject) => {
      const req = https.request(
        "https://api.resend.com/emails",
        {
          method: "POST",
          agent: proxy ? new HttpsProxyAgent(proxy) : undefined,
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          },
        },
        (res) => {
          res.resume();
          res.on("end", () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300)
              resolve();
            else reject(new Error(`Resend HTTP ${res.statusCode}`));
          });
        },
      );
      req.setTimeout(30000, () =>
        req.destroy(new Error("Mail request timed out")),
      );
      req.on("error", () => reject(new Error("Mail network request failed")));
      req.end(payload);
    });
    return;
  }
  throw new Error("Configure SMTP or Resend");
}
export async function notifications(send: typeof sendEmail = sendEmail) {
  if (demoMode()) return;
  const settings = await getSettings();
  const date = new Date();
  if (date.getUTCHours() === settings.dailyHourUTC) {
    const key = `daily:${date.toISOString().slice(0, 10)}`;
    const active = await db.deliveryException.findMany({
      where: { active: true, type: { notIn: settings.disabledCategories } },
      include: { shipment: true },
      take: 1000,
      orderBy: { priority: "desc" },
    });
    await db.notification.upsert({
      where: { dedupeKey: key },
      update: {},
      create: {
        dedupeKey: key,
        title: "Daily shipment exception summary",
        body: active.length
          ? active.map((e) => `${e.shipment.number}: ${e.title}`).join("\n")
          : "No active delivery exceptions.",
        priority: 1,
        emailState: "pending",
      },
    });
  }
  for (const row of await db.notification.findMany({
    where: { emailState: "pending", emailAttempts: { lt: 5 } },
    take: 30,
  })) {
    try {
      await send(settings.recipients, row.title, row.body);
      await db.notification.update({
        where: { id: row.id },
        data: {
          emailState: "sent",
          emailError: null,
          emailAttempts: { increment: 1 },
        },
      });
    } catch {
      await db.notification.update({
        where: { id: row.id },
        data: {
          emailAttempts: { increment: 1 },
          emailState: row.emailAttempts >= 4 ? "failed" : "pending",
          emailError:
            "Delivery failed; check mail configuration. Up to five attempts.",
        },
      });
      throw new Error("Email delivery failed");
    }
  }
}
