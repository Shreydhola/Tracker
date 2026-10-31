import PgBoss from "pg-boss";
let instance: Promise<PgBoss> | undefined;
export function queue() {
  return (instance ??= (async () => {
    const boss = new PgBoss({
      connectionString: process.env.DATABASE_URL!,
      retryLimit: 5,
      retryDelay: 30,
      retryBackoff: true,
      expireInSeconds: 300,
      deleteAfterDays: 14,
    });
    boss.on("error", () =>
      console.error("Queue error; inspect database connection"),
    );
    await boss.start();
    for (const name of [
      "register",
      "webhook",
      "audit",
      "reconcile",
      "notify",
      "maintenance",
    ])
      await boss.createQueue(name);
    return boss;
  })());
}
export async function signalRegistration() {
  const boss = await queue();
  return boss.send(
    "register",
    {},
    { singletonKey: "pending", singletonSeconds: 60 },
  );
}
