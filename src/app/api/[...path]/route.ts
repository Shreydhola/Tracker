import { NextRequest, NextResponse } from "next/server";
import { uploadForm, limitedBody } from "@/lib/body";
import { requestProvider } from "@/lib/provider";
import { ingestTrack } from "@/lib/tracking";
import { hash, compare } from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  login,
  logout,
  requireUser,
  sameOrigin,
  audit,
  rateLimit,
} from "@/lib/auth";
import { failure } from "@/lib/http";
import {
  parseUpload,
  validateRows,
  mappingSchema,
  confirmImport,
  safeCell,
} from "@/lib/imports";
import { getSettings, settingsSchema } from "@/lib/settings";
import { signalRegistration, queue } from "@/lib/queue";
import { shipmentWhere } from "@/lib/queries";
import { config, liveProviderReady, demoMode } from "@/lib/config";
import writeXlsxFile from "write-excel-file/node";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    await sameOrigin();
    const { path } = await params;
    const endpoint = path.join("/");
    if (endpoint === "auth/login") {
      const b = z
        .object({
          email: z.email().max(200),
          password: z.string().min(1).max(200),
        })
        .parse(JSON.parse((await limitedBody(req, 20000)).toString("utf8")));
      await login(b.email, b.password);
      return NextResponse.json({ ok: true });
    }
    const user = await requireUser();
    await rateLimit("api:" + user.id, 120, 60);
    if (endpoint === "auth/logout") {
      await logout();
      return NextResponse.json({ ok: true });
    }
    if (endpoint === "imports/preview") {
      const form = await uploadForm(req);
      const file = form.get("file");
      if (!(file instanceof File)) throw new Error("VALIDATION: Select a file");
      if (file.size > 10 * 1024 * 1024)
        throw new Error("VALIDATION: Maximum file size is 10 MB");
      const data = await parseUpload(
        Buffer.from(await file.arrayBuffer()),
        file.name,
      );
      const job = await db.importJob.create({
        data: {
          filename: file.name.slice(0, 255),
          createdBy: user.id,
          rows: data.rows,
          mapping: data.mapping,
        },
      });
      const settings = await getSettings();
      const validated = validateRows(
        data.rows,
        data.mapping,
        settings.defaultMarketplace,
      );
      const existing = await db.shipment.findMany({
        where: { number: { in: validated.map((r) => r.number) } },
        select: { number: true },
      });
      return NextResponse.json({
        id: job.id,
        headers: data.headers,
        rows: data.rows.slice(0, 50),
        mapping: data.mapping,
        total: data.rows.length,
        errors: validated.filter((r) => r.error).slice(0, 50),
        existing: existing.length,
      });
    }
    if (endpoint === "imports/confirm") {
      const b = z
        .object({ id: z.string(), mapping: mappingSchema })
        .parse(JSON.parse((await limitedBody(req, 20000)).toString("utf8")));
      const settings = await getSettings();
      const result = await confirmImport(
        b.id,
        user.id,
        b.mapping,
        settings.defaultMarketplace,
      );
      await audit(user.email, "import", b.id, result as object);
      let queued = true;
      try {
        await signalRegistration();
      } catch {
        queued = false;
      }
      return NextResponse.json({ result, queued });
    }
    if (endpoint === "settings") {
      const settings = settingsSchema.parse(
        JSON.parse((await limitedBody(req, 20000)).toString("utf8")),
      );
      await db.systemSetting.upsert({
        where: { key: "settings" },
        update: { value: settings },
        create: { key: "settings", value: settings },
      });
      await audit(user.email, "settings.update", "settings");
      return NextResponse.json({ ok: true });
    }
    if (endpoint === "account") {
      const b = z
        .object({
          name: z.string().min(1).max(100),
          currentPassword: z.string().max(200),
          newPassword: z
            .string()
            .min(14)
            .max(72)
            .refine(
              (p) => Buffer.byteLength(p) <= 72,
              "Password must fit 72 UTF-8 bytes",
            ),
        })
        .parse(JSON.parse((await limitedBody(req, 20000)).toString("utf8")));
      if (!(await compare(b.currentPassword, user.passwordHash)))
        throw new Error("VALIDATION: Current password is incorrect");
      await db.$transaction([
        db.user.update({
          where: { id: user.id },
          data: { name: b.name, passwordHash: await hash(b.newPassword, 12) },
        }),
        db.session.deleteMany({ where: { userId: user.id } }),
      ]);
      await audit(user.email, "password.change", user.id);
      return NextResponse.json({ ok: true });
    }
    if (endpoint === "provider/test") {
      if (!liveProviderReady())
        throw new Error(
          "VALIDATION: Configure credentials and verify the official provider contract first",
        );
      const shipment = await db.shipment.findFirst({
        where: { demo: false, registeredAt: { not: null } },
      });
      if (!shipment)
        throw new Error(
          "VALIDATION: Register a real shipment before testing the provider connection",
        );
      const result = await requestProvider("gettrackinfo", [
        {
          number: shipment.number,
          ...(shipment.carrierCode ? { carrier: shipment.carrierCode } : {}),
        },
      ]);
      for (const item of result.accepted) await ingestTrack(item);
      return NextResponse.json({
        message: `Provider responded: ${result.accepted.length} accepted, ${result.rejected.length} rejected.`,
      });
    }
    if (endpoint === "shipments/bulk") {
      const b = z
        .object({
          ids: z.array(z.string()).min(1).max(500),
          action: z.enum(["retry", "reconcile", "notes"]),
          notes: z.string().max(2000).optional(),
        })
        .parse(JSON.parse((await limitedBody(req, 20000)).toString("utf8")));
      if (b.action === "retry") {
        await db.shipment.updateMany({
          where: { id: { in: b.ids }, registeredAt: null },
          data: { registrationTries: 0, registrationError: null },
        });
        await signalRegistration();
      } else if (b.action === "notes") {
        await db.shipment.updateMany({
          where: { id: { in: b.ids } },
          data: { notes: b.notes ?? "" },
        });
      } else {
        const boss = await queue();
        await boss.send("reconcile", { ids: b.ids });
      }
      await audit(user.email, "bulk." + b.action, b.ids.join(","));
      return NextResponse.json({ ok: true });
    }
    if (path[0] === "exceptions" && path[1]) {
      const b = z
        .object({
          action: z.enum(["acknowledge", "resolve", "note"]),
          note: z.string().max(2000).default(""),
        })
        .parse(JSON.parse((await limitedBody(req, 20000)).toString("utf8")));
      await db.deliveryException.update({
        where: { id: path[1] },
        data: {
          ...(b.action === "acknowledge"
            ? { acknowledgedAt: new Date() }
            : b.action === "resolve"
              ? { active: false, resolvedAt: new Date() }
              : {}),
          followUps: {
            create: { actor: user.email, action: b.action, note: b.note },
          },
        },
      });
      await audit(user.email, "exception." + b.action, path[1]);
      return NextResponse.json({ ok: true });
    }
    if (endpoint === "filters") {
      const b = z
        .object({
          name: z.string().min(1).max(80),
          query: z.record(z.string(), z.string()),
        })
        .parse(JSON.parse((await limitedBody(req, 20000)).toString("utf8")));
      return NextResponse.json(
        await db.savedFilter.create({ data: { userId: user.id, ...b } }),
      );
    }
    if (path[0] === "notifications" && path[1]) {
      await db.notification.update({
        where: { id: path[1] },
        data: { readAt: new Date() },
      });
      return NextResponse.json({ ok: true });
    }
    if (endpoint === "webhooks/replay") {
      const b = z
        .object({ id: z.string() })
        .parse(JSON.parse((await limitedBody(req, 20000)).toString("utf8")));
      await db.webhookEvent.update({
        where: { id: b.id },
        data: { state: "pending", error: null },
      });
      await (await queue()).send("webhook", { id: b.id });
      await audit(user.email, "webhook.replay", b.id);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (e) {
    return failure(e);
  }
}
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path } = await params;
    const endpoint = path.join("/");
    if (endpoint === "health") {
      await db.$queryRaw`SELECT 1`;
      const hb = await db.systemSetting.findUnique({
        where: { key: "workerHeartbeat" },
      });
      const worker =
        !!hb && Date.now() - new Date(String(hb.value)).getTime() < 180000;
      return NextResponse.json(
        { database: true, worker },
        { status: worker ? 200 : 503 },
      );
    }
    const user = await requireUser();
    if (endpoint === "session")
      return NextResponse.json({
        name: user.name,
        email: user.email,
        mode: config().APP_MODE,
      });
    if (endpoint === "dashboard") {
      const where = shipmentWhere(req.nextUrl.searchParams);
      const [
        groups,
        carriers,
        total,
        delayed,
        issueCount,
        issues,
        recent,
        completed,
        carrierOptions,
      ] = await Promise.all([
        db.shipment.groupBy({ by: ["status"], where, _count: true }),
        db.shipment.groupBy({ by: ["carrier"], where, _count: true }),
        db.shipment.count({ where }),
        db.shipment.count({
          where: {
            AND: [
              where,
              {
                exceptions: {
                  some: {
                    active: true,
                    type: { in: ["no_movement", "long_transit", "deadline"] },
                  },
                },
              },
            ],
          },
        }),
        db.deliveryException.count({
          where: { active: true, shipment: where },
        }),
        db.deliveryException.findMany({
          where: { active: true, shipment: where },
          include: { shipment: true },
          orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
          take: 5,
        }),
        db.shipment.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          take: 6,
        }),
        db.shipment.findMany({
          where: {
            AND: [
              where,
              {
                status: "Delivered",
                lastEventAt: { gte: new Date(Date.now() - 14 * 86400000) },
              },
            ],
          },
          select: { lastEventAt: true, shippedAt: true },
        }),
        db.shipment.findMany({
          distinct: ["carrier"],
          select: { carrier: true },
        }),
      ]);
      const performance = Array.from({ length: 14 }, (_, i) => {
        const day = new Date(Date.now() - (13 - i) * 86400000)
          .toISOString()
          .slice(0, 10);
        return {
          day,
          count: completed.filter(
            (r) => r.lastEventAt?.toISOString().slice(0, 10) === day,
          ).length,
        };
      });
      return NextResponse.json({
        groups,
        carriers,
        total,
        delayed,
        issueCount,
        issues,
        recent,
        performance,
        carrierOptions,
      });
    }
    if (endpoint === "shipments" || endpoint === "export") {
      const p = req.nextUrl.searchParams;
      const where = shipmentWhere(p);
      const orderField = [
        "number",
        "createdAt",
        "updatedAt",
        "shippedAt",
        "lastEventAt",
        "status",
      ].includes(p.get("sort") ?? "")
        ? p.get("sort")!
        : "createdAt";
      const orderBy = {
        [orderField]:
          p.get("direction") === "asc" ? ("asc" as const) : ("desc" as const),
      };
      if (endpoint === "export") {
        const rows = await db.shipment.findMany({
          where,
          orderBy,
          take: 10000,
        });
        const columns = [
          "number",
          "orderId",
          "carrier",
          "marketplace",
          "destination",
          "status",
          "latestDescription",
          "latestLocation",
          "shippedAt",
          "lastEventAt",
          "notes",
        ] as const;
        const format = p.get("format");
        if (format === "xlsx") {
          const table = [
            columns.map((c) => String(c)),
            ...rows.map((r) =>
              columns.map((c) =>
                safeCell(
                  r[c] instanceof Date ? (r[c] as Date).toISOString() : r[c],
                ),
              ),
            ),
          ];
          return new NextResponse(
            new Uint8Array(
              await writeXlsxFile(table, { sheet: "Shipments" }).toBuffer(),
            ),
            {
              headers: {
                "Content-Type":
                  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": "attachment; filename=shipments.xlsx",
              },
            },
          );
        }
        const esc = (s: unknown) =>
          '"' +
          safeCell(s instanceof Date ? s.toISOString() : s).replace(
            /"/g,
            '""',
          ) +
          '"';
        return new NextResponse(
          [
            columns.join(","),
            ...rows.map((r) => columns.map((c) => esc(r[c])).join(",")),
          ].join("\r\n"),
          {
            headers: {
              "Content-Type": "text/csv",
              "Content-Disposition": "attachment; filename=shipments.csv",
            },
          },
        );
      }
      const page = Math.max(1, Math.min(100000, Number(p.get("page")) || 1));
      const [rows, total, carriers] = await Promise.all([
        db.shipment.findMany({
          where,
          orderBy,
          take: 25,
          skip: (page - 1) * 25,
          include: { exceptions: { where: { active: true } } },
        }),
        db.shipment.count({ where }),
        db.shipment.findMany({
          distinct: ["carrier"],
          select: { carrier: true },
        }),
      ]);
      return NextResponse.json({ rows, total, page, carriers });
    }
    if (path[0] === "shipments" && path[1]) {
      const s = await db.shipment.findUnique({
        where: { id: path[1] },
        include: {
          events: { orderBy: { occurredAt: "asc" } },
          exceptions: {
            include: { followUps: { orderBy: { createdAt: "asc" } } },
            orderBy: { createdAt: "desc" },
          },
          attempts: { orderBy: { createdAt: "desc" }, take: 20 },
        },
      });
      if (!s) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(s);
    }
    if (endpoint === "exceptions") {
      return NextResponse.json(
        await db.deliveryException.findMany({
          where:
            req.nextUrl.searchParams.get("history") === "true"
              ? {}
              : { active: true },
          include: { shipment: true, followUps: true },
          orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
          take: 500,
        }),
      );
    }
    if (endpoint === "notifications") {
      return NextResponse.json(
        await db.notification.findMany({
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
      );
    }
    if (endpoint === "filters") {
      return NextResponse.json(
        await db.savedFilter.findMany({ where: { userId: user.id } }),
      );
    }
    if (endpoint === "settings") {
      const [settings, hb, webhook] = await Promise.all([
        getSettings(),
        db.systemSetting.findUnique({ where: { key: "workerHeartbeat" } }),
        db.webhookEvent.findFirst({
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
      ]);
      return NextResponse.json({
        settings,
        provider: {
          configured: !!process.env.TRACK17_API_KEY,
          verified: process.env.TRACK17_CONTRACT_VERIFIED === "true",
          ready: liveProviderReady(),
          version: process.env.TRACK17_API_VERSION ?? "unset",
        },
        workerHeartbeat: hb?.value,
        lastWebhook: webhook?.createdAt,
        emailConfigured: !!(
          process.env.SMTP_HOST || process.env.RESEND_API_KEY
        ),
        mode: demoMode() ? "demo" : "live",
        user: { name: user.name, email: user.email },
      });
    }
    if (endpoint === "usage") {
      const start = new Date();
      start.setUTCDate(1);
      start.setUTCHours(0, 0, 0, 0);
      const [counts, monthly, webhooks, imports, logs] = await Promise.all([
        db.registrationAttempt.groupBy({ by: ["outcome"], _count: true }),
        db.registrationAttempt.count({ where: { createdAt: { gte: start } } }),
        db.webhookEvent.findMany({
          orderBy: { createdAt: "desc" },
          take: 30,
          select: { id: true, state: true, error: true, createdAt: true },
        }),
        db.importJob.findMany({
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            filename: true,
            state: true,
            result: true,
            createdAt: true,
          },
        }),
        db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
      ]);
      const jobs =
        await db.$queryRaw`SELECT id,name,state,retrycount,createdon,output FROM pgboss.job WHERE state='failed' ORDER BY createdon DESC LIMIT 30`.catch(
          () => [],
        );
      return NextResponse.json({
        counts,
        monthly,
        remainingCredits: null,
        webhooks,
        imports,
        logs,
        jobs,
        estimatedMonthly: Math.round((monthly / new Date().getUTCDate()) * 30),
        settings: await getSettings(),
      });
    }
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (e) {
    return failure(e);
  }
}
