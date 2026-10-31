import { db } from "./db";
import { getSettings } from "./settings";
import { evaluate } from "./rules";
export async function evaluateShipment(id: string) {
  const settings = await getSettings();
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Shipment" WHERE id=${id} FOR UPDATE`;
    const s = await tx.shipment.findUniqueOrThrow({ where: { id } });
    const rules = evaluate(s, settings).map((r) => ({
      ...r,
      priority: settings.priorityOverrides[r.type] ?? r.priority,
    }));
    const active = await tx.deliveryException.findMany({
      where: { shipmentId: id, active: true },
    });
    for (const r of rules) {
      const prev = active.find((x) => x.type === r.type);
      const incident = prev
        ? await tx.deliveryException.update({
            where: { id: prev.id },
            data: { priority: r.priority, title: r.title },
          })
        : await tx.deliveryException.create({ data: { shipmentId: id, ...r } });
      if (settings.disabledCategories.includes(r.type)) continue;
      const key = `incident:${incident.id}:${r.priority}`;
      await tx.notification.upsert({
        where: { dedupeKey: key },
        update: {},
        create: {
          dedupeKey: key,
          exceptionId: incident.id,
          title: r.title,
          body: `${s.number} · ${s.orderId || "No order ID"}`,
          priority: r.priority,
          emailState:
            settings.immediateUrgent && r.priority === 3
              ? "pending"
              : "disabled",
        },
      });
    }
    for (const old of active.filter(
      (x) => !rules.some((r) => r.type === x.type),
    ))
      await tx.deliveryException.update({
        where: { id: old.id },
        data: { active: false, resolvedAt: new Date() },
      });
  });
}
export async function evaluateAll() {
  let cursor: string | undefined;
  while (true) {
    const list = await db.shipment.findMany({
      take: 200,
      orderBy: { id: "asc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    for (const s of list) await evaluateShipment(s.id);
    if (list.length < 200) break;
    cursor = list.at(-1)!.id;
  }
}
